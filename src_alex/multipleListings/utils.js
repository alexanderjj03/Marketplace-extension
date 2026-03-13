import OpenAI from "openai";

/* ---------- utilities ---------- */
export function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function round2(x) {
  return Math.round(x * 100) / 100;
}

export function safeOpaque(rgba) {
  const m = typeof rgba === 'string' ? rgba.match(/^rgba\(\s*([0-9.\s]+),\s*([0-9.\s]+),\s*([0-9.\s]+),\s*([0-9.\s]+)\s*\)$/i) : null;
  if (!m) return rgba;
  const r = +m[1], g = +m[2], b = +m[3];
  return `rgba(${r}, ${g}, ${b}, 0.8)`;
}

// Styling helpers with stale-node guards
export function highlightListing(element, color, tooltip) {
  if (!element || !document.contains(element)) return;
  element.style.backgroundColor = color;
  element.style.border = '2px solid ' + safeOpaque(color);
  element.title = tooltip;
}

export function resetListingStyle(element) {
  if (!element || !document.contains(element)) return;
  element.style.backgroundColor = '';
  element.style.border = '';
  element.title = '';
}

export async function callModel(prompt) {
  const apiKey = await chrome.storage.local.get('apiKey');
  const client = new OpenAI({
    apiKey: apiKey.apiKey,
    dangerouslyAllowBrowser: true
  }); // find a secure method for this, such as an env variable/chrome storage. Make a new API key after tests are done.

  try {
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.5
    });

    return response.output_text.trim();
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    return null;
  }
}