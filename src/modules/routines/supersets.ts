/** Consecutive linked exercises share a superset group number. */
export function toSupersetGroups(items: { linkNext: boolean }[]) {
  const groups: (number | null)[] = [];
  const links = items.map((item, i) => item.linkNext && i < items.length - 1);
  let group = 0;
  links.forEach((linkNext, i) => {
    const linkedFromPrev = i > 0 && links[i - 1];
    if (linkNext || linkedFromPrev) {
      if (!linkedFromPrev) group += 1;
      groups.push(group);
    } else groups.push(null);
  });
  return groups;
}
