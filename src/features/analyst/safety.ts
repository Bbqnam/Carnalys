export function untrustedMarketplaceText(value: string, maximumCharacters = 600) {
  return {
    trust: "untrusted_marketplace_data" as const,
    text: value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximumCharacters),
  };
}

