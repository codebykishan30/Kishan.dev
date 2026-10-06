export default function About() {
  return (
    <section className="section container" id="about">
      <div className="section-heading reveal"><p className="eyebrow">A LITTLE ABOUT ME</p><h2>Curious by nature.<br /><span>Built to create.</span></h2></div>
      <div className="about-grid">
        <div className="about-copy reveal">
          <p>I’m an aspiring Computer Science Engineer interested in software development and building useful, real-world applications. I enjoy working across frontend and backend development, APIs, databases, and modern development tools.</p>
          <p>Based in Bengaluru, Karnataka, I focus on creating responsive web experiences with clean, maintainable code and thoughtful interfaces.</p>
          <div className="interest-tags"><span>Software development</span><span>Web development</span><span>APIs & databases</span><span>Real-world apps</span></div>
        </div>
        <article className="glass-card education-card reveal">
          <div className="card-icon education-logo-wrap">
            <img
              src="https://files.reva.ac.in/assets/frontend/images/logo-icon.png"
              alt="REVA University logo"
              className="education-logo"
            />
          </div>
          <p className="eyebrow">EDUCATION</p>
          <h3>REVA University</h3>
          <p>UGC-recognized private university established in 2012 in Yelahanka, Bengaluru, with a 45-acre green campus, NAAC A+ accreditation, and 100+ academic programmes for 16,000+ students.</p>
          <div className="education-meta"><span>Bengaluru, India</span><span>Academic Excellence</span></div>
        </article>
      </div>
    </section>
  );
}
