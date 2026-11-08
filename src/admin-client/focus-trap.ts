// Keeps Tab inside a container while it is open and gives focus back to the opener afterwards.
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * While `active` is true: moves focus into `container` (the `[data-autofocus]` element if present, else the
 * first focusable one, else the container itself), traps Tab, and on close returns focus to whatever had it.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>, active: Ref<boolean>): void {
  // Islands with `client:load` are also rendered on the server, where there is no DOM.
  if (typeof document === 'undefined') return;

  let opener: HTMLElement | null = null;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !container.value) return;
    const items = focusableIn(container.value);
    if (items.length === 0) {
      event.preventDefault();
      container.value.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !container.value.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !container.value.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  }

  function release(): void {
    document.removeEventListener('keydown', onKeydown, true);
    const target = opener;
    opener = null;
    if (target && document.contains(target)) target.focus();
  }

  watch(
    active,
    async (isActive) => {
      if (isActive) {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.addEventListener('keydown', onKeydown, true);
        await nextTick();
        const root = container.value;
        if (!root) return;
        const preferred = root.querySelector<HTMLElement>('[data-autofocus]');
        (preferred ?? focusableIn(root)[0] ?? root).focus();
      } else {
        release();
      }
    },
    { immediate: true, flush: 'post' },
  );

  onBeforeUnmount(release);
}
