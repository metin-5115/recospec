import { CHARS_PER_TOKEN_ESTIMATE } from '@shared/constants'
import { assertNoLeakedSecrets } from './prompt-export'
import { LLM_CONTEXT_VERSION } from './llm-context-types'
import type { IRParamType } from '../ir/types'
import type {
  LlmContext,
  LlmElement,
  LlmFingerprint,
  LlmLocator,
  LlmMethod,
  LlmPage,
  LlmRequest,
  LlmStep,
} from './llm-context-types'

const HEADER_TAG = '#recospec-ctx'
const FALLBACK_SEPARATOR = ' ~ '
const SECRET_MARK = '*'
const FRAGILE_MARK = '!'
const EMPTY_FIELD = '-'

const LEGEND = [
  '#el: id page name tag[:type] role "label" locator [~ fallback]... [!=fragile locator] [*=secret]',
  '#step: n action [el] [arg]',
]

const PARAM_TYPE_CODES: Record<IRParamType, string> = {
  string: 's',
  number: 'n',
  boolean: 'b',
  date: 'd',
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

function formatLocator(locator: LlmLocator): string {
  return `${locator.strategy}:${locator.value}`
}

function formatTag(el: LlmElement): string {
  return el.inputType ? `${el.tag}:${el.inputType}` : el.tag
}

function formatPage(page: LlmPage): string {
  return [page.id, page.className, page.path, page.title ? JSON.stringify(page.title) : undefined]
    .filter((part): part is string => part !== undefined)
    .join(' ')
}

function formatElement(el: LlmElement): string {
  const locators = [el.locator, ...el.fallbacks].map(formatLocator).join(FALLBACK_SEPARATOR)
  return [
    el.id,
    el.page,
    el.name,
    formatTag(el),
    el.role ?? EMPTY_FIELD,
    el.label ? JSON.stringify(el.label) : EMPTY_FIELD,
    locators,
    el.isFragile ? FRAGILE_MARK : undefined,
    el.isSecret ? SECRET_MARK : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ')
}

function formatFingerprint(id: string, fp: LlmFingerprint): string {
  return [
    id,
    fp.path ? `path=${fp.path}` : undefined,
    fp.neighbors.length > 0 ? `near=${fp.neighbors.join('|')}` : undefined,
    fp.box ? `box=${fp.box}` : undefined,
    fp.attrs.length > 0 ? `a=${fp.attrs.join(',')}` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ')
}

function formatStep(step: LlmStep): string {
  return [String(step.n), step.action, step.el, step.value]
    .filter((part): part is string => part !== undefined)
    .join(' ')
}

/** `[1,2,3,5]` → `1-3,5`. */
function formatStepRanges(numbers: number[]): string {
  const ranges: string[] = []
  let start = 0
  for (let i = 0; i < numbers.length; i++) {
    const isRunEnd = i === numbers.length - 1 || numbers[i + 1] !== numbers[i]! + 1
    if (!isRunEnd) continue
    const from = numbers[start]!
    const to = numbers[i]!
    ranges.push(from === to ? String(from) : `${from}-${to}`)
    start = i + 1
  }
  return ranges.join(',')
}

function formatMethod(method: LlmMethod): string {
  const params = method.params
    .map((p) => `${p.name}${p.isSecret ? SECRET_MARK : ''}:${PARAM_TYPE_CODES[p.type]}`)
    .join(',')
  return `${method.page}.${method.name}(${params}) steps=${formatStepRanges(method.steps)}`
}

function formatRequest(request: LlmRequest): string {
  return [
    request.method,
    request.path,
    request.status,
    request.type,
    request.count > 1 ? `×${request.count}` : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(' ')
}

function section(title: string, lines: string[]): string[] {
  return lines.length > 0 ? [`@${title}`, ...lines] : []
}

function finish(text: string, ctx: LlmContext): string {
  if (ctx.redactSecrets) assertNoLeakedSecrets(text)
  return text
}

export function renderLlmContextCompact(ctx: LlmContext): string {
  const header = [
    `${HEADER_TAG} v${LLM_CONTEXT_VERSION}`,
    `flow=${ctx.flow}`,
    ctx.framework ? `fw=${ctx.framework}` : undefined,
    ctx.base ? `base=${ctx.base}` : undefined,
    `task=${ctx.task}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ')

  const fingerprints = ctx.elements.flatMap((el) =>
    el.fingerprint ? [formatFingerprint(el.id, el.fingerprint)] : [],
  )

  const lines = [
    header,
    ...LEGEND,
    ...section('pages', ctx.pages.map(formatPage)),
    ...section('el', ctx.elements.map(formatElement)),
    ...section('fp', fingerprints),
    ...section('steps', ctx.steps.map(formatStep)),
    ...section('methods', ctx.methods.map(formatMethod)),
    ...section('net', ctx.requests.map(formatRequest)),
    ...section(
      'rules',
      ctx.rules.map((rule) => `- ${rule}`),
    ),
    ...(ctx.ask ? section('task', [ctx.ask]) : []),
  ]
  return finish(`${lines.join('\n')}\n`, ctx)
}

/** Drops trailing empty slots so tuples stay as short as their content. */
function trimTuple(tuple: unknown[]): unknown[] {
  let end = tuple.length
  while (end > 0 && (tuple[end - 1] === undefined || tuple[end - 1] === null)) end--
  return tuple.slice(0, end)
}

const toPair = (locator: LlmLocator): [string, string] => [locator.strategy, locator.value]

/** Column order of each tuple list, so a model can read the positional JSON without a prompt. */
const JSON_COLUMNS = {
  pg: 'id,class,path,title',
  el: 'id,page,name,tag,role,label,[strategy,value],[[fallback]],secret,fragile',
  fp: 'id,path,near,box,attrs',
  steps: 'n,action,el,arg',
  m: 'page,name,[[param,type,secret]],steps',
  net: 'method,path,status,type,count',
}

export function renderLlmContextJson(ctx: LlmContext): string {
  const body = {
    v: LLM_CONTEXT_VERSION,
    cols: JSON_COLUMNS,
    flow: ctx.flow,
    fw: ctx.framework,
    base: ctx.base || undefined,
    kind: ctx.task,
    pg: ctx.pages.map((p) => trimTuple([p.id, p.className, p.path, p.title])),
    el: ctx.elements.map((e) =>
      trimTuple([
        e.id,
        e.page,
        e.name,
        formatTag(e),
        e.role,
        e.label,
        toPair(e.locator),
        e.fallbacks.length > 0 ? e.fallbacks.map(toPair) : undefined,
        e.isSecret ? 1 : undefined,
        e.isFragile ? 1 : undefined,
      ]),
    ),
    fp: ctx.elements.flatMap((e) =>
      e.fingerprint
        ? [
            trimTuple([
              e.id,
              e.fingerprint.path,
              e.fingerprint.neighbors,
              e.fingerprint.box,
              e.fingerprint.attrs,
            ]),
          ]
        : [],
    ),
    steps: ctx.steps.map((s) => trimTuple([s.n, s.action, s.el, s.value])),
    m: ctx.methods.map((m) => [
      m.page,
      m.name,
      m.params.map((p) =>
        trimTuple([p.name, PARAM_TYPE_CODES[p.type], p.isSecret ? 1 : undefined]),
      ),
      m.steps,
    ]),
    net: ctx.requests.map((r) =>
      trimTuple([r.method, r.path, r.status, r.type, r.count > 1 ? r.count : undefined]),
    ),
    rules: ctx.rules.length > 0 ? ctx.rules : undefined,
    ask: ctx.ask,
  }
  const dropEmpty = (_key: string, value: unknown): unknown =>
    Array.isArray(value) && value.length === 0 ? undefined : value
  return finish(JSON.stringify(body, dropEmpty), ctx)
}
