import { useState } from "react";

const SCALE_TOOLTIP =
  "Semantic similarity score.\n\n" +
  "70%+  strong match\n" +
  "55–70%  loosely related\n" +
  "<55%  likely unrelated (baseline noise)";

function scoreBucket(distance) {
  const pct = Math.max(0, Math.round((1 - distance) * 100));
  let bucket;
  if (pct >= 70) bucket = "strong";
  else if (pct >= 55) bucket = "moderate";
  else bucket = "weak";
  return { pct, bucket };
}

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(await res.text());
      setResults(await res.json());
    } catch (err) {
      setError(String(err));
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <h1>Photo Tagger</h1>
      <form onSubmit={onSubmit} className="search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='try "clay art" or "sculpture AND ceramic"'
          autoFocus
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {results !== null && (
        <>
          <p className="count">
            {results.length} result{results.length === 1 ? "" : "s"}
          </p>
          <div className="grid">
            {results.map((r) => {
              const { pct, bucket } = scoreBucket(r.distance);
              return (
                <figure key={r.id} className="card">
                  <img src={`/api/image/${r.id}`} alt={r.tags} loading="lazy" />
                  <figcaption>
                    <span className={`score score-${bucket}`} title={SCALE_TOOLTIP}>
                      {pct}%
                    </span>
                    {r.tags}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
