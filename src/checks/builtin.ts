import type { SemanticCheck } from "./types";

export const builtinChecks: SemanticCheck[] = [
  {
    id: "credential_theft",
    label: "credential / secret theft",
    instructions:
      "Does `chunk.files` steal credentials, tokens, cookies, private keys, or other secrets and send or write them somewhere the project would not normally need, rather than using its own configured secrets for a documented purpose?",
    criteria: {
      true: "The code harvests secrets it does not own or forwards them to an unexpected destination.",
      false: "Any secret use is the program reading credentials it is supposed to use, or there is no secret handling.",
    },
    reasons: {
      env_exfil: "Harvests environment or credential stores and sends them off-box.",
      browser_or_token_steal: "Reads cookies, tokens, or keychains and copies them elsewhere.",
      unexpected_secret_write: "Writes secrets to a location a user would not expect.",
      none: "No secret-theft pattern stands out.",
    },
  },
  {
    id: "data_exfiltration",
    label: "unexpected data exfiltration",
    instructions:
      "Does `chunk.files` collect user files, messages, databases, or other local data and send them to a destination that is hidden, unrelated to the project's purpose, or otherwise unexpected?",
    criteria: {
      true: "Local data is gathered and transmitted in a way that looks like theft or covert upload.",
      false: "Any outbound data matches a stated product feature such as sync, backup, analytics the user would expect, or there is no upload.",
    },
    reasons: {
      silent_upload: "Uploads local files or user content without a matching product purpose.",
      bulk_harvest: "Walks disks or app data and ships a broad dump outward.",
      hidden_channel: "Sends data over an unexpected host, webhook, or paste service.",
      none: "No unexpected exfiltration stands out.",
    },
  },
  {
    id: "hidden_network",
    label: "hidden or suspicious network activity",
    instructions:
      "Does `chunk.files` open network connections that are hidden, encoded, unused by the apparent feature set, or pointed at unexplained hosts, rather than ordinary API, update, or telemetry calls?",
    criteria: {
      true: "Network use is covert, encoded to hide the destination, or unrelated to what the code claims to do.",
      false: "Network use is ordinary and matches the project's purpose, or there is no network use.",
    },
    reasons: {
      unexplained_host: "Contacts a host that does not match the project's documented services.",
      covert_channel: "Hides the destination or payload (DNS tunneling, encoded URLs, steganography).",
      unused_listener: "Opens a listener or reverse channel the product does not need.",
      none: "No hidden network activity stands out.",
    },
  },
  {
    id: "dynamic_code",
    label: "dynamic code download / execution",
    instructions:
      "Does `chunk.files` download code or scripts at runtime and execute them, or decode and run hidden payloads, in a way that bypasses the reviewed source rather than a documented plugin or update system?",
    criteria: {
      true: "Remote or packed code is fetched and executed as a hidden second program.",
      false: "Any dynamic loading is a documented plugin, WASM module, or update channel, or there is none.",
    },
    reasons: {
      remote_eval: "Fetches code from the network and evals or otherwise executes it.",
      packed_payload: "Decodes an embedded payload and runs it as code.",
      dropper: "Writes a downloaded binary or script and launches it.",
      none: "No hidden dynamic-execution pattern stands out.",
    },
  },
  {
    id: "permission_abuse",
    label: "permission abuse",
    instructions:
      "Does `chunk.files` request, grant, or use privileges far beyond what the visible product needs, or silently escalate rights, rather than asking for capabilities a legitimate tool of this type would need?",
    criteria: {
      true: "Privileges are excessive, hidden, or used to take over the machine or other accounts.",
      false: "Permission use matches the product type (installer, admin tool, CI runner) or is absent.",
    },
    reasons: {
      silent_escalate: "Escalates privileges or writes authorization rules without a matching user action.",
      oversized_scope: "Requests broad access that the visible features do not need.",
      persist_admin: "Leaves lasting admin or root access the product does not require.",
      none: "No permission abuse stands out.",
    },
  },
  {
    id: "persistence",
    label: "persistence / background execution",
    instructions:
      "Does `chunk.files` install a hidden startup hook, scheduled task, service, or background agent that keeps running after the user would think the program stopped, rather than a documented daemon or updater?",
    criteria: {
      true: "It plants covert persistence or a background agent the user would not expect.",
      false: "Any background work is a documented service, worker, or updater, or there is none.",
    },
    reasons: {
      startup_hook: "Adds a hidden login item, cron, systemd unit, or Run key.",
      watchdog: "Respawns itself after the user quits.",
      implant: "Installs a long-lived agent unrelated to the advertised program.",
      none: "No covert persistence stands out.",
    },
  },
  {
    id: "stealth",
    label: "stealth / obfuscation",
    instructions:
      "Does `chunk.files` hide its real behavior with heavy obfuscation, anti-analysis checks, or misleading names, rather than ordinary minification, bundling, or licensed third-party code?",
    criteria: {
      true: "Obfuscation or anti-analysis is used to conceal hostile or unexpected behavior.",
      false: "Code is readable, or any compression is ordinary build output, not a hiding trick.",
    },
    reasons: {
      string_hide: "Hides URLs, commands, or payloads behind encoding meant to evade review.",
      anti_analysis: "Detects debuggers, VMs, or scanners in order to change or hide behavior.",
      misleading_names: "Uses decoy names or comments that contradict what the code does.",
      none: "No stealth or hostile obfuscation stands out.",
    },
  },
  {
    id: "deception",
    label: "deceptive behavior",
    instructions:
      "Does `chunk.files` lie to the user, impersonate another program or vendor, fake a UI or consent prompt, or disguise its purpose, rather than implementing the feature it appears to implement?",
    criteria: {
      true: "The code is designed to trick a person or another program about what it is or what it is doing.",
      false: "The code's behavior matches its names, comments, and apparent purpose.",
    },
    reasons: {
      impersonation: "Pretends to be another app, vendor, or system prompt.",
      fake_consent: "Shows a false permission or update dialog.",
      bait_and_switch: "Advertised feature is a cover for unrelated hostile actions.",
      none: "No deceptive behavior stands out.",
    },
  },
  {
    id: "suspicious_ci",
    label: "suspicious build / CI behavior",
    instructions:
      "Do the build or CI files in `chunk.files` exfiltrate secrets, inject unreviewed remote scripts, publish artifacts to unexpected places, or run privileged steps that a normal pipeline for this project would not need?",
    criteria: {
      true: "The pipeline steals secrets, pulls untrusted remote code, or ships artifacts to an unexpected sink.",
      false: "CI and build steps are ordinary test, lint, build, or deploy actions, or there is no pipeline here.",
    },
    reasons: {
      secret_webhook: "CI secrets are posted to a webhook or third-party sink.",
      remote_script: "The pipeline curls and runs a script that is not pinned in-repo.",
      unexpected_publish: "Artifacts or credentials are published to an unexplained registry or bucket.",
      none: "No suspicious build or CI behavior stands out.",
    },
  },
  {
    id: "telemetry",
    label: "telemetry / analytics",
    kind: "advisory",
    instructions:
      "Does `chunk.files` send usage events, diagnostics, crash reports, feature-flag pings, or analytics to a first-party or vendor host? Documented and ordinary telemetry still counts as yes. The product's own feature traffic (sync, model calls, search) does not.",
    criteria: {
      true: "The code phones home with usage, diagnostics, crashes, or analytics.",
      false: "There is no telemetry, or outbound traffic is the product feature itself.",
    },
    reasons: {
      usage_analytics: "Sends usage or product-analytics events off-box.",
      crash_or_diagnostics: "Sends crash reports or diagnostic dumps to a collector.",
      vendor_sdk: "Embeds a third-party analytics, error, or feature-flag SDK.",
      none: "No telemetry stands out.",
    },
  },
];
