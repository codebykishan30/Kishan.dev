export default function News({ news }) {
  return (
    <section className="section container" id="news">
      <div className="section-heading reveal"><p className="eyebrow">NOTES & UPDATES</p><h2>Recent writing<span>.</span></h2></div>
      {news.length ? <div className="news-grid">{news.map((article) => (
        <article className="news-card glass-card reveal" key={article.id}>
          {article.image_url && <img src={article.image_url} alt="" loading="lazy" />}
          <div className="news-card-body">
            <span className="eyebrow">{article.category} · {article.author}</span>
            <h3>{article.title}</h3><p>{article.summary}</p>
            <time>{article.published_at ? new Date(article.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</time>
          </div>
        </article>
      ))}</div> : <p className="public-empty-note">New articles are coming soon.</p>}
    </section>
  );
}
