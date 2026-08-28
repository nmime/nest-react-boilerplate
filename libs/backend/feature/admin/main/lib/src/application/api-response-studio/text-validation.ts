import type { ApiResponseStudioPresentation, ApiResponseStudioTexts } from '@app/backend-feature-auth-shared';
import { ProblemPresentationDisplays, ProblemPresentationSeverities } from '@app/common-problem-details';

const ControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const VariablePattern = /\{([A-Za-z_][A-Za-z0-9_.-]{0,63})\}/gu;
const TagPattern = /<\/?([a-z][a-z0-9]*)>/giu;
const AnyAngleTagPattern = /<[^>]*>/gu;
const AllowedTags = new Set(['b', 'br', 'code', 'em', 'i', 'strong', 'u']);
const SelfClosingTags = new Set(['br']);
const MaxLines = 8;
const MaxLineLength = 500;
const MaxCommentLength = 2000;
const MaxCustomDescriptionLength = 1000;

export class ApiResponseStudioValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiResponseStudioValidationError';
  }
}

const normalizedLines = (lines: readonly string[] | undefined): string[] =>
  (lines ?? []).map((line) => line.trim()).filter(Boolean);

const variablesFor = (lines: readonly string[]): string[] =>
  [
    ...new Set(
      lines.flatMap((line) => [...line.matchAll(VariablePattern)].map((match) => match[1] ?? '')).filter(Boolean),
    ),
  ].sort();

const tagsFor = (lines: readonly string[]): string[] => {
  const tags: string[] = [];
  for (const line of lines) {
    for (const raw of line.matchAll(AnyAngleTagPattern)) {
      const match = /^<\/?([a-z][a-z0-9]*)>$/iu.exec(raw[0]);
      if (!match || !AllowedTags.has((match[1] ?? '').toLowerCase())) {
        throw new ApiResponseStudioValidationError('Presentation text contains unsupported markup.');
      }
    }
    const stack: string[] = [];
    for (const match of line.matchAll(TagPattern)) {
      const raw = match[0];
      const tag = (match[1] ?? '').toLowerCase();
      tags.push(tag);
      if (SelfClosingTags.has(tag)) {
        continue;
      }
      if (raw.startsWith('</')) {
        if (stack.pop() !== tag) {
          throw new ApiResponseStudioValidationError('Presentation text contains unbalanced markup.');
        }
      } else {
        stack.push(tag);
      }
    }
    if (stack.length > 0) {
      throw new ApiResponseStudioValidationError('Presentation text contains unbalanced markup.');
    }
  }
  return [...new Set(tags)].sort();
};

const assertBalancedVariables = (lines: readonly string[]): void => {
  for (const line of lines) {
    const withoutVariables = line.replace(VariablePattern, '');
    if (withoutVariables.includes('{') || withoutVariables.includes('}')) {
      throw new ApiResponseStudioValidationError('Presentation text contains unbalanced variables.');
    }
  }
};

export const normalizeAndValidatePresentation = (
  input: ApiResponseStudioPresentation,
): ApiResponseStudioPresentation => {
  if (!ProblemPresentationDisplays.includes(input.display)) {
    throw new ApiResponseStudioValidationError('Unsupported presentation display.');
  }
  if (!ProblemPresentationSeverities.includes(input.severity)) {
    throw new ApiResponseStudioValidationError('Unsupported presentation severity.');
  }

  const texts: ApiResponseStudioTexts = {
    en: normalizedLines(input.texts.en),
    ru: normalizedLines(input.texts.ru),
    zh: normalizedLines(input.texts.zh),
  };
  const languages = Object.entries(texts).filter(([, lines]) => lines.length > 0);
  for (const [language, lines] of languages) {
    if (lines.length > MaxLines) {
      throw new ApiResponseStudioValidationError(`${language.toUpperCase()} presentation has too many lines.`);
    }
    for (const line of lines) {
      if (line.length > MaxLineLength) {
        throw new ApiResponseStudioValidationError(`${language.toUpperCase()} presentation line is too long.`);
      }
      if (ControlCharacterPattern.test(line)) {
        throw new ApiResponseStudioValidationError(
          `${language.toUpperCase()} presentation contains control characters.`,
        );
      }
    }
    assertBalancedVariables(lines);
    tagsFor(lines);
  }

  const referenceVariables = languages[0] ? variablesFor(languages[0][1]) : [];
  const referenceTags = languages[0] ? tagsFor(languages[0][1]) : [];
  for (const [language, lines] of languages.slice(1)) {
    if (JSON.stringify(variablesFor(lines)) !== JSON.stringify(referenceVariables)) {
      throw new ApiResponseStudioValidationError(`${language.toUpperCase()} variables do not match other languages.`);
    }
    if (JSON.stringify(tagsFor(lines)) !== JSON.stringify(referenceTags)) {
      throw new ApiResponseStudioValidationError(`${language.toUpperCase()} markup does not match other languages.`);
    }
  }

  const comments = input.comments.trim();
  const customDescription = input.customDescription.trim();
  if (comments.length > MaxCommentLength || ControlCharacterPattern.test(comments)) {
    throw new ApiResponseStudioValidationError('Presentation comments are invalid.');
  }
  if (customDescription.length > MaxCustomDescriptionLength || ControlCharacterPattern.test(customDescription)) {
    throw new ApiResponseStudioValidationError('Custom presentation description is invalid.');
  }
  if (input.figmaOnly && input.display !== 'custom') {
    throw new ApiResponseStudioValidationError('Figma-only is valid only for custom presentation.');
  }
  if (input.display === 'custom' && customDescription) {
    try {
      const parsed = new URL(customDescription);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) {
        throw new Error('unsafe');
      }
    } catch {
      if (/^https?:/iu.test(customDescription)) {
        throw new ApiResponseStudioValidationError('Custom presentation URL must be a safe HTTPS URL.');
      }
    }
  }

  return {
    display: input.display,
    severity: input.severity,
    support: input.display === 'toast' || input.display === 'modal' ? input.support : false,
    customDescription: input.display === 'custom' ? customDescription : '',
    figmaOnly: input.display === 'custom' ? input.figmaOnly : false,
    comments,
    texts,
  };
};
