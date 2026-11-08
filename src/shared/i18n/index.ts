import { messages } from './messages';

export { messages } from './messages';

export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof messages.en;

type Placeholders<Value extends string> = Value extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never;

type Params<Key extends MessageKey> =
  Placeholders<(typeof messages.en)[Key]> extends never
    ? []
    : [values: Record<Placeholders<(typeof messages.en)[Key]>, string | number>];

export function t<Key extends MessageKey>(locale: Locale, key: Key, ...args: Params<Key>): string {
  const values = args[0] as Record<string, string | number> | undefined;
  return messages[locale][key].replace(/\{([^{}]+)\}/g, (placeholder, name: string) =>
    String(values?.[name] ?? placeholder),
  );
}
