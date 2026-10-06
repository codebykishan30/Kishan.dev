import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="container hero" id="home">
      <div className="hero-copy reveal">
        <p className="eyebrow"><span className="status-dot" /> AVAILABLE FOR HIRE <span className="eyebrow-divider">/</span> BENGALURU, INDIA</p>
        <p className="hello">Hello, I'm</p>
        <h1>KISHAN <span>C</span></h1>
        <h2>Aspiring Computer Science Engineer</h2>
        <p className="hero-description">Building next-generation digital experiences with clean architecture, responsive web engineering, and modern development technologies.</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/contact">Get in Touch <i className="bx bx-right-arrow-alt" /></Link>
          <Link className="button button-ghost" to="/projects">View Work <i className="bx bx-arrow-down-right" /></Link>
          <a className="resume-link" href="https://github.com/Kishan-devflow/blob/main/Kishan%20resume.pdf" target="_blank" rel="noreferrer">View Resume <i className="bx bx-link-external" /></a>
        </div>
        <div className="hero-foot"><span><i className="bx bx-map" /> Bengaluru, Karnataka, India</span><span><i className="bx bx-code-alt" /> Full-Stack Developer · Builder</span></div>
      </div>
      <div className="hero-visual reveal">
        <div className="portrait-frame">
          <img src="/assets/portrait.jpg" alt="Kishan C" />
          <div className="portrait-overlay" /><div className="orbit orbit-a" /><div className="orbit orbit-b" />
          <div className="code-float float-top">&lt;build /&gt;</div><div className="code-float float-bottom">Hello, world!</div>
        </div>
        <div className="visual-caption"><span>01 / DEVELOPER PROFILE</span><span>INDIA · IST</span></div>
      </div>
    </section>
  );
}
