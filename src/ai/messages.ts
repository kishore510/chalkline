import { messageFrom, type AiErrorKind, type FriendlyError, type MessageTable, type Vars } from '@/errors/friendly'

/*
 * Wording for AI request problems, in the same shape as every other message
 * (friendly.ts). Kept here so it loads with the AI code, not with the app.
 */

const NOT_SENT = 'Nothing was changed in your diagram.'

/** "about 30 seconds", "about 2 minutes" */
function waitText(seconds: number) {
  if (seconds < 90) return `about ${Math.max(1, Math.round(seconds))} second${Math.round(seconds) === 1 ? '' : 's'}`
  const minutes = Math.round(seconds / 60)
  return `about ${minutes} minute${minutes === 1 ? '' : 's'}`
}

const AI_MESSAGES: MessageTable<AiErrorKind> = {
  'ai-no-key': () => ({
    title: 'No API key yet',
    message: 'AI features use your own Anthropic API key.',
    next: 'Add one in Settings, under AI.',
  }),
  'ai-invalid-key': () => ({
    title: 'That API key didn’t work',
    message: `Anthropic didn’t accept it: it may be mistyped, revoked or expired. ${NOT_SENT}`,
    next: 'Copy the key again from the Claude Console, save it, and test it.',
  }),
  'ai-permission': () => ({
    title: 'Your key isn’t allowed to do that',
    message: `The key works, but its organisation or workspace doesn’t allow this model or request. ${NOT_SENT}`,
    next: 'Check the key’s workspace and model access in the Claude Console.',
  }),
  'ai-billing': () => ({
    title: 'There’s a billing problem with your API account',
    message: `Anthropic refused the request because of billing or payment details. ${NOT_SENT}`,
    next: 'Check Billing in the Claude Console, then try again.',
  }),
  'ai-rate-limited': (v) => ({
    title: 'Too many requests for now',
    message: `Your API account has reached a rate limit. ${NOT_SENT}`,
    next: v.wait !== undefined ? `Wait ${waitText(v.wait)}, then choose Retry.` : 'Wait a minute, then choose Retry.',
  }),
  'ai-spend-limit': () => ({
    title: 'Your API spending limit is reached',
    message: `Your Anthropic account has reached its monthly spend limit, so requests are paused. ${NOT_SENT}`,
    next: 'Raise or remove the limit in the Claude Console, or wait until it resets.',
  }),
  'ai-overloaded': () => ({
    title: 'The AI service is busy',
    message: `Anthropic’s API is overloaded right now. This isn’t a problem with your key. ${NOT_SENT}`,
    next: 'Wait a little, then choose Retry.',
  }),
  'ai-server': () => ({
    title: 'The AI service had a problem',
    message: `Anthropic’s API returned an error on its side. ${NOT_SENT}`,
    next: 'Choose Retry in a moment. If it keeps happening, try again later.',
  }),
  'ai-timeout': () => ({
    title: 'The request took too long',
    message: `No answer came back in time, so Chalkline stopped waiting. ${NOT_SENT}`,
    next: 'Check your connection, then choose Retry.',
  }),
  'ai-too-large': () => ({
    title: 'Too much to send in one go',
    message: `The request is bigger than the API accepts. ${NOT_SENT}`,
    next: 'Select fewer shapes, or leave out notes, and try again.',
  }),
  'ai-model-unavailable': () => ({
    title: 'That AI model isn’t available',
    message: `The API doesn’t offer the model this version of Chalkline uses, or your key can’t use it. ${NOT_SENT}`,
    next: 'Reload the page to get the latest Chalkline, then try again.',
  }),
  'ai-bad-request': () => ({
    title: 'The AI service turned the request down',
    message: `Anthropic’s API said the request wasn’t valid. ${NOT_SENT}`,
    next: 'Details has the reason. If it mentions a usage limit, check your limits in the Claude Console.',
  }),
  'ai-offline': () => ({
    title: 'You’re offline',
    message: `This device isn’t connected to the internet, so nothing was sent. ${NOT_SENT}`,
    next: 'Reconnect, then choose Retry.',
  }),
  'ai-blocked': () => ({
    title: 'Could not reach the API',
    message: `Could not reach the API. Your network or browser may be blocking it. ${NOT_SENT}`,
    next: 'Ad blockers, privacy extensions, and work or school networks can block api.anthropic.com. Try another network or browser, then choose Retry.',
  }),
  'ai-cancelled': () => ({
    title: 'Cancelled',
    message: `The request was stopped. ${NOT_SENT}`,
    next: 'Choose Retry to send it again.',
  }),
  'ai-unexpected': () => ({
    title: 'The AI service sent back something unexpected',
    message: `Chalkline couldn’t read the answer. ${NOT_SENT}`,
    next: 'Choose Retry. If it keeps happening, reload the page to get the latest Chalkline.',
  }),
  'ai-malformed': () => ({
    title: 'The answer couldn’t be turned into a diagram',
    message: `The AI sent back something that wasn’t a diagram Chalkline could read. ${NOT_SENT}`,
    next: 'Choose Retry to ask again, or reword your description. Each try is a new request.',
  }),
  'ai-refused': () => ({
    title: 'The AI declined this request',
    message: `The model chose not to answer this description. ${NOT_SENT}`,
    next: 'Reword the description and try again.',
  }),
  'ai-truncated': () => ({
    title: 'The answer was cut off',
    message: `The diagram was too big to finish in one answer. ${NOT_SENT}`,
    next: 'Ask for fewer shapes, or turn off notes, and try again.',
  }),
}

/** The friendly message for an AI problem, with an optional (redacted) technical detail. */
export const aiError = (kind: AiErrorKind, detail?: string, vars: Vars = {}): FriendlyError => messageFrom(AI_MESSAGES, kind, detail, vars)
