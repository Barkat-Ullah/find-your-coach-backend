export const toStringArray = (val: any): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') {
    // try parse JSON string: '["a","b"]'
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch (_) {
      // not a JSON array string
    }
    // fallback: comma separated
    return val
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
};
