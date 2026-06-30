(function (root, factory) {
  const engine = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
  root.NameEngine = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
return {
  extractCompleteNameObjects(content) {
    const results = [];
    const starts = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (ch === '{') {
        starts.push(i);
        continue;
      }

      if (ch === '}' && starts.length > 0) {
        const start = starts.pop();
        try {
          const obj = JSON.parse(content.slice(start, i + 1));
          this.collectNameObjects(obj, results);
        } catch (_) {
          // Ignore incomplete or non-name JSON fragments while streaming.
        }
      }
    }

    return this.dedupeByName(results);
  },

  collectNameObjects(value, results) {
    if (!value || typeof value !== 'object') return;

    if (typeof value.name === 'string' && value.score != null) {
      results.push(value);
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.collectNameObjects(item, results));
      return;
    }

    Object.values(value).forEach((item) => this.collectNameObjects(item, results));
  },

  takeFreshNames(names, seen) {
    const fresh = [];
    names.forEach((item) => {
      if (!item?.name || seen.has(item.name)) return;
      seen.add(item.name);
      fresh.push(item);
    });
    return fresh;
  },

  filterUniqueNames(names, { surname = '', storage, limit = names.length } = {}) {
    const seen = new Set();
    const unique = [];

    for (const item of names) {
      if (!item?.name || seen.has(item.name)) continue;

      const fullName = surname ? surname + item.name : item.name;
      if (storage?.isDiscarded?.(fullName)) continue;
      if (storage?.isInHistory?.(fullName)) continue;
      if (storage?.isInGivenNameHistory?.(item.name)) continue;
      if (surname && [...surname].some((ch) => item.name.includes(ch))) continue;
      if (storage?.isStrongSurname?.(item.name[0])) continue;

      seen.add(item.name);
      unique.push(item);
      if (unique.length >= limit) break;
    }

    return unique;
  },

  dedupeByName(names) {
    const seen = new Set();
    return names.filter((item) => {
      if (!item?.name || seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
  },
};
});
