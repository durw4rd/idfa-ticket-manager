import type { KeyboardEvent } from 'react';

/**
 * Arrow-key behaviour for a group of role="radio" buttons, as native radios have: arrows and
 * Home/End move to and select another option. Give the selected option (or the first, when none
 * is selected) tabIndex 0 and the rest -1, so the group is a single Tab stop.
 */
export function handleRadioKeys(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
  select: (index: number) => void
) {
  let next: number;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (index + 1) % count;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (index - 1 + count) % count;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = count - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  select(next);
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[next]?.focus();
}
