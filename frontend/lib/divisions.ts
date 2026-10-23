// Preserve the API's existing division key while using the league's public name.
export const divisionLabel = (division: string) => division === "Senior" ? "Open" : division;
