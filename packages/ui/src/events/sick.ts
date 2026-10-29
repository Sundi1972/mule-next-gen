/** Why a sick player fell sick, read from the server's line ("Lena fell sick: the air is bad."), or null. */
export const sickBecause = (line: string) => line.match(/fell sick: (.+?)\.?$/)?.[1] ?? null;
