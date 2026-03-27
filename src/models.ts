type ModelSource = Record<string, unknown>;

const DEFAULT_COST = { input: 0, output: 0 };
const DEFAULT_LIMIT = { context: 128000, output: 16384 };

function isVersionSegment(segment: string): boolean {
  return /^\d+(?:\.\d+)*$/.test(segment);
}

function isOpenAIOSeriesSegment(segment: string): boolean {
  return /^o\d+$/i.test(segment);
}

export function formatModelName(slug: string): string {
  return slug
    .split("-")
    .filter((segment) => segment.length > 0)
    .map((segment) => {
      const lowerSegment = segment.toLowerCase();

      if (isVersionSegment(segment)) {
        return segment;
      }

      if (lowerSegment === "gpt") {
        return "GPT";
      }

      if (isOpenAIOSeriesSegment(segment)) {
        return lowerSegment;
      }

      return `${lowerSegment[0]?.toUpperCase() ?? ""}${lowerSegment.slice(1)}`;
    })
    .join(" ");
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function buildCapabilities(source: ModelSource) {
  const capabilities = readRecord(source.capabilities);
  const input = readRecord(capabilities.input);
  const output = readRecord(capabilities.output);

  const temperature = readBoolean(capabilities.temperature, source.temperature) ?? true;
  const reasoning = readBoolean(capabilities.reasoning, source.reasoning) ?? false;
  const attachment = readBoolean(capabilities.attachment, source.attachment) ?? false;
  const toolcall = readBoolean(capabilities.toolcall, source.toolcall, source.tool_call) ?? true;

  return {
    temperature,
    reasoning,
    attachment,
    toolcall,
    input: {
      text: readBoolean(input.text) ?? true,
      audio: readBoolean(input.audio) ?? false,
      image: readBoolean(input.image) ?? attachment,
      video: readBoolean(input.video) ?? false,
      pdf: readBoolean(input.pdf) ?? attachment,
    },
    output: {
      text: readBoolean(output.text) ?? true,
      audio: readBoolean(output.audio) ?? false,
      image: readBoolean(output.image) ?? false,
      video: readBoolean(output.video) ?? false,
      pdf: readBoolean(output.pdf) ?? false,
    },
    interleaved: capabilities.interleaved ?? source.interleaved ?? false,
  };
}

function buildCost(source: ModelSource) {
  const cost = readRecord(source.cost);

  return {
    input: readNumber(cost.input) ?? DEFAULT_COST.input,
    output: readNumber(cost.output) ?? DEFAULT_COST.output,
  };
}

function buildLimit(source: ModelSource) {
  const limit = readRecord(source.limit);

  return {
    context: readNumber(limit.context) ?? DEFAULT_LIMIT.context,
    output: readNumber(limit.output) ?? DEFAULT_LIMIT.output,
  };
}

export function buildMultiCopilotModel(
  bareId: string,
  source: ModelSource = {},
  options: { includeProviderMeta?: boolean } = {}
) {
  const { capabilities, ...restWithoutCapabilities } = source;
  const normalizedCapabilities = buildCapabilities(source);
  const model = {
    ...restWithoutCapabilities,
    id: bareId,
    name:
      typeof source.name === "string" && source.name.length > 0
        ? source.name
        : formatModelName(bareId),
    temperature: normalizedCapabilities.temperature,
    reasoning: normalizedCapabilities.reasoning,
    attachment: normalizedCapabilities.attachment,
    tool_call: normalizedCapabilities.toolcall,
    cost: buildCost(source),
    limit: buildLimit(source),
    capabilities: normalizedCapabilities,
  };

  if (!options.includeProviderMeta) {
    return model;
  }

  const sourceApi = readRecord(source.api);

  return {
    ...model,
    providerID: "multi-copilot",
    api: {
      id: typeof sourceApi.id === "string" && sourceApi.id.length > 0 ? sourceApi.id : bareId,
      npm: "@ai-sdk/openai-compatible",
    },
  };
}
