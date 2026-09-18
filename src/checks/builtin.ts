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
  {
    id: "authentication_bypass",
    label: "authentication bypass / hidden backdoor",
    instructions:
      "Does `chunk.files` add a hidden account, hardcoded credential, secret path, or other way to skip authentication that a normal operator would not see, rather than a documented admin recovery flow or test fixture?",
    criteria: {
      true: "There is a hidden login, master password, debug door, or auth skip that is not a documented recovery or test-only path.",
      false: "Authentication is ordinary, any override is a documented admin or test hook, or there is no auth here.",
    },
    reasons: {
      hardcoded_door: "A hardcoded password, token, or account unlocks the system.",
      secret_route: "A hidden URL, header, or flag skips authentication.",
      always_allow: "Auth checks are disabled or short-circuited in production code.",
      none: "No backdoor or auth bypass stands out.",
    },
  },
  {
    id: "command_and_control",
    label: "remote command execution / command-and-control",
    instructions:
      "Does `chunk.files` take commands from a remote host and run them on this machine (a shell, script, or API the operator did not issue), rather than a documented remote-admin, agent, or job-runner product?",
    criteria: {
      true: "A remote party can send commands that this code executes, and that channel is not a documented admin or worker feature.",
      false: "Any remote control is a documented agent, SSH, or job API, or the code does not run remote commands.",
    },
    reasons: {
      reverse_shell: "Opens a reverse shell or remote-command channel.",
      c2_poll: "Polls a host for commands and executes whatever comes back.",
      unattended_rpc: "Exposes an unauthenticated or hidden RPC that runs OS commands.",
      none: "No covert remote-command channel stands out.",
    },
  },
  {
    id: "surveillance",
    label: "surveillance / input and device capture",
    instructions:
      "Does `chunk.files` capture keystrokes, clipboard, screen, microphone, camera, or location without a matching documented feature, rather than a screen recorder, accessibility tool, or conferencing app that advertises that capture?",
    criteria: {
      true: "Input or device capture is hidden, broader than the stated feature, or sent somewhere the user would not expect.",
      false: "Any capture matches a documented recorder, a11y, or conferencing feature, or there is no capture.",
    },
    reasons: {
      keylog: "Records keystrokes or input events covertly.",
      clipboard_or_screen: "Reads clipboard, screenshots, or the display without a matching feature.",
      mic_cam_or_location: "Taps microphone, camera, or location without a matching feature.",
      none: "No covert capture stands out.",
    },
  },
  {
    id: "destructive_behavior",
    label: "destructive behavior / sabotage",
    instructions:
      "Does `chunk.files` wipe, encrypt-for-ransom, corrupt, or brick files, disks, firmware, or accounts in a way the product does not advertise, rather than a documented formatter, factory-reset, or uninstall cleaner?",
    criteria: {
      true: "The code destroys or ransoms user data or the system without a matching documented wipe or reset feature.",
      false: "Any deletion is a documented reset, uninstall, or user-requested cleanup, or there is no destructive action.",
    },
    reasons: {
      wipe: "Deletes or formats user data or disks without a matching reset feature.",
      ransom: "Encrypts files and demands or implies payment to restore them.",
      corrupt: "Silently corrupts data, configs, or firmware so the system fails.",
      none: "No sabotage stands out.",
    },
  },
  {
    id: "supply_chain",
    label: "supply-chain manipulation",
    instructions:
      "Does `chunk.files` swap, typosquat, or inject a dependency, install script, or published artifact so that someone else's build or install pulls hostile code, rather than a normal version bump or documented mirror?",
    criteria: {
      true: "A dependency, lockfile, installer, or publish step is altered to deliver code the project does not actually contain.",
      false: "Dependency and publish changes are ordinary version pins or documented mirrors, or there is no package metadata here.",
    },
    reasons: {
      dependency_swap: "Replaces a package name, URL, or integrity hash with an unexpected source.",
      install_hook: "A preinstall, postinstall, or setup hook pulls or runs extra unreviewed code.",
      artifact_inject: "Published or vendored artifacts do not match the reviewed source.",
      none: "No supply-chain manipulation stands out.",
    },
  },
  {
    id: "security_weakening",
    label: "security weakening",
    instructions:
      "Does `chunk.files` turn off TLS verification, signature checks, sandboxing, updates, or antivirus/firewall protections in a way the product does not need, rather than a documented debug flag or enterprise policy hook?",
    criteria: {
      true: "Safety checks or host defenses are disabled, bypassed, or gutted without a matching documented debug or policy feature.",
      false: "Any relaxation is a documented insecure-dev flag or admin policy, or protections stay in place.",
    },
    reasons: {
      tls_or_signature: "Skips certificate, TLS, or code-signature verification.",
      sandbox_off: "Disables a sandbox, CSP, or isolation boundary.",
      defense_tamper: "Stops, excludes, or reconfigures antivirus, firewall, or updates to hide activity.",
      none: "No security weakening stands out.",
    },
  },
  {
    id: "resource_abuse",
    label: "resource abuse / cryptomining / proxying",
    instructions:
      "Does `chunk.files` use this machine's CPU, GPU, bandwidth, or network identity for mining, scanning, or proxying that the product does not advertise, rather than a documented renderer, encoder, or user-requested share?",
    criteria: {
      true: "The machine is used as a miner, open proxy, or scan bot without a matching documented feature.",
      false: "Heavy compute or proxying is a documented product feature the user asked for, or there is none.",
    },
    reasons: {
      miner: "Runs a cryptominer or stratum client.",
      open_proxy: "Turns the host into a relay, botnet worker, or residential proxy.",
      abuse_scan: "Uses the host to scan, flood, or otherwise abuse third parties.",
      none: "No resource abuse stands out.",
    },
  },
  {
    id: "lateral_movement",
    label: "lateral movement / propagation",
    instructions:
      "Does `chunk.files` copy itself or a payload onto other hosts, shares, containers, or accounts on the network, rather than a documented fleet deploy, sync, or clustering feature?",
    criteria: {
      true: "The code spreads to other machines or accounts in a way that looks like worming, not a documented deploy.",
      false: "Any multi-host action is a documented deploy, backup, or cluster join, or it stays on this machine.",
    },
    reasons: {
      worm_copy: "Copies itself or a dropper onto other hosts or shares.",
      credential_reuse: "Reuses stolen or local credentials to log into other systems.",
      service_spread: "Abuses SSH, SMB, RDP, Docker, or similar to propagate.",
      none: "No lateral movement stands out.",
    },
  },
  {
    id: "anti_removal",
    label: "anti-removal / self-protection",
    instructions:
      "Does `chunk.files` block uninstall, reinstall itself after deletion, or fight the user or an admin trying to remove it, rather than a documented service that requires a normal stop/uninstall step?",
    criteria: {
      true: "The code resists removal, respawns after delete, or locks the user out of uninstall.",
      false: "Any protect-from-stop behavior is a documented service or license manager, or there is none.",
    },
    reasons: {
      uninstall_block: "Hides, disables, or fails the uninstall / remove path.",
      respawn: "Recreates files, services, or tasks after the user deletes them.",
      tamper_watch: "Watches for removal or analysis and fights back (kill, lock, wipe).",
      none: "No anti-removal behavior stands out.",
    },
  },
  {
    id: "covert_fingerprinting",
    label: "covert fingerprinting / excessive collection",
    instructions:
      "Does `chunk.files` fingerprint the device or user, or collect more environment, identity, or browsing data than a documented analytics or crash pipeline would need, in a covert or excessive way? Ordinary opt-in telemetry belongs in the telemetry category, not here.",
    criteria: {
      true: "Collection is hidden, far beyond a normal analytics/crash SDK, or used to identify the user without a matching disclosure.",
      false: "Any collection is ordinary documented telemetry, or there is no extra fingerprinting.",
    },
    reasons: {
      device_fingerprint: "Builds a hidden device or browser fingerprint.",
      excess_identity: "Collects identifiers, files, or environment far beyond a crash/usage ping.",
      silent_track: "Tracks the user across sessions or apps without a matching disclosure.",
      none: "No covert fingerprinting or excess collection stands out.",
    },
  },
];
