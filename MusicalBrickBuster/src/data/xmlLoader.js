export function parseXmlString(xmlText) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, "application/xml");
  const parseError = documentNode.querySelector("parsererror");

  if (parseError) {
    throw new Error(parseError.textContent.trim());
  }

  return documentNode;
}

export async function fetchXmlDocument(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }

  const xmlText = await response.text();
  return parseXmlString(xmlText);
}
