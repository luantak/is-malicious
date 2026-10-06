import type { JevAnswerMap, JevAsker, QuestionMap } from "./jev";

export const OPENAI_DECISIONS_MODEL = "gpt-6-luna";

export function createDecisionsAsker(
  options: { apiKey?: string; baseURL?: string; timeout?: number } = {},
): JevAsker {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim())
    throw new Error("OPENAI_API_KEY is required for OpenAI Decisions");
  const root = (
    options.baseURL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const url = new URL(
    `${root.endsWith("/v1") ? root : `${root}/v1`}/decisions`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "OpenAI base URL must be an HTTP or HTTPS API root without credentials, query, or fragment",
    );
  }
  return {
    async ask(state, questions, model = OPENAI_DECISIONS_MODEL) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: typeof state === "string" ? state : JSON.stringify(state),
          questions: decisionQuestions(questions),
        }),
        signal: AbortSignal.timeout(options.timeout ?? 60_000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error(
          `OpenAI Decisions request failed with HTTP ${response.status}`,
        );
      const body = (await response.json()) as Record<string, unknown>;
      const usage = body.usage as Record<string, unknown> | undefined;
      if (
        typeof body.model !== "string" ||
        !usage ||
        !tokenCount(usage.input_tokens) ||
        !tokenCount(usage.output_tokens)
      ) {
        throw new Error("Invalid OpenAI Decisions model or usage");
      }
      return {
        model: body.model,
        answers: decisionAnswers(body.answers, questions),
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
      };
    },
  };
}

function tokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function decisionQuestions(questions: QuestionMap): unknown[] {
  return Object.entries(questions).map(([name, question]) => {
    const common = { name, instructions: question.instructions };
    if (question.type === "noul") {
      return {
        ...common,
        type: "predicate",
        instructions: `${question.instructions}${question.criteria ? `\nCriteria: ${JSON.stringify(question.criteria)}` : ""}`,
      };
    }
    if (question.type === "choice") {
      return {
        ...common,
        type: "choice",
        choices: Object.entries(question.criteria).map(
          ([value, description]) => ({
            value,
            ...(description === null
              ? {}
              : {
                  description:
                    typeof description === "string"
                      ? description
                      : JSON.stringify(description),
                }),
          }),
        ),
      };
    }
    if (question.type === "score") {
      return {
        ...common,
        type: "score",
        levels: question.criteria.map((level) => ({
          label: typeof level === "string" ? level : JSON.stringify(level),
        })),
      };
    }
    throw new Error(`Unsupported Decisions question type for ${name}`);
  });
}

function probability(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function decisionAnswers(raw: unknown, questions: QuestionMap): JevAnswerMap {
  if (!Array.isArray(raw)) throw new Error("Invalid OpenAI Decisions answers");
  const answers: JevAnswerMap = Object.create(null);
  for (const item of raw) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      !Object.hasOwn(questions, item.name) ||
      Object.hasOwn(answers, item.name)
    ) {
      throw new Error("Unknown or duplicate OpenAI Decisions answer");
    }
    const question = questions[item.name];
    const invalid = () =>
      new Error(`Invalid or refused OpenAI Decisions answer for ${item.name}`);
    if (question.type === "noul") {
      if (item.type !== "predicate" || !probability(item.probability))
        throw invalid();
      answers[item.name] = { type: "noul", noul: item.probability };
      continue;
    }
    if (
      item.type !== question.type ||
      !probability(item.confidence) ||
      !Array.isArray(item.probabilities)
    )
      throw invalid();
    const allowed =
      question.type === "choice"
        ? Object.keys(question.criteria)
        : question.criteria.map((_, index) => String(index));
    const probabilities: Record<string, number> = Object.create(null);
    for (const entry of item.probabilities) {
      if (
        !entry ||
        (question.type === "choice"
          ? typeof entry.value !== "string"
          : !Number.isInteger(entry.value)) ||
        !allowed.includes(String(entry.value)) ||
        Object.hasOwn(probabilities, String(entry.value)) ||
        !probability(entry.probability)
      )
        throw invalid();
      probabilities[String(entry.value)] = entry.probability;
    }
    if (Object.keys(probabilities).length !== allowed.length) throw invalid();
    if (question.type === "choice") {
      if (typeof item.choice !== "string" || !allowed.includes(item.choice))
        throw invalid();
      answers[item.name] = {
        type: "choice",
        choice: item.choice,
        confidence: item.confidence,
        probabilities,
      };
    } else if (question.type === "score") {
      if (
        typeof item.score !== "number" ||
        !Number.isFinite(item.score) ||
        item.score < 0 ||
        item.score > allowed.length - 1
      )
        throw invalid();
      answers[item.name] = {
        type: "score",
        score: item.score,
        confidence: item.confidence,
        probabilities,
      };
    } else throw invalid();
  }
  if (Object.keys(answers).length !== Object.keys(questions).length)
    throw new Error("Missing OpenAI Decisions answers");
  return answers;
}
