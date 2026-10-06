import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { supabaseConfigured } from './lib/supabase-env.js';
import { socials } from './data/socials.js';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';
import Experience from './pages/Experience.jsx';
import Skills from './pages/Skills.jsx';
import Projects from './pages/Projects.jsx';
import Contact from './pages/Contact.jsx';

// Loaded on demand so the Supabase client is not part of the public bundle.
const Profile = lazy(() => import('./pages/Profile.jsx'));

function ProfileLoading() {
  return (
    <section className="section container" aria-live="polite" aria-busy="true">
      <div className="section-heading">
        <p className="eyebrow">YOUR ACCOUNT · SUPABASE POWERED</p>
        <h2>Your profile<span>.</span></h2>
      </div>
      <p className="public-empty-note">Loading your profile…</p>
    </section>
  );
}

export default function PublicPortfolio() {
  const location = useLocation();
  const [projects, setProjects] = useState([]);
  const [skills, setSkills] = useState([]);
  const [contentError, setContentError] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [location.pathname, projects, skills]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    if (!supabaseConfigured) return undefined;
    let active = true;
    import('./lib/supabase.js').then(({ requireSupabase }) => Promise.all([
      requireSupabase().from('projects').select('id,title,short_description,image_url,technologies,category,github_url,live_url,featured').eq('status', 'published').order('featured', { ascending: false }).order('created_at', { ascending: false }),
      requireSupabase().from('skills').select('id,name,category').order('category').order('name'),
    ])).then(([projectResult, skillResult]) => {
      const failure = projectResult.error || skillResult.error;
      if (failure) throw failure;
      if (active) {
        setProjects(projectResult.data || []);
        setSkills(skillResult.data || []);
      }
    }).catch((error) => {
      console.error('Unable to load published portfolio content:', error);
      if (active) setContentError(true);
    });
    return () => { active = false; };
  }, []);

  return <div className="public-site-shell">
    <div className="ambient-orb orb-one" /><div className="ambient-orb orb-two" />
    <Navbar />

    <main>
      <Routes>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="experience" element={<Experience />} />
        <Route path="skills" element={<Skills skills={skills} />} />
        <Route path="projects" element={<Projects projects={projects} contentError={contentError} />} />
        <Route path="profile" element={<Suspense fallback={<ProfileLoading />}><Profile /></Suspense>} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>

    <footer className="site-footer"><div className="container footer-inner"><Link className="brand-logo" to="/">KISHAN<span>.</span></Link><p>Engineered with Precision.</p><div className="footer-socials">{socials.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}</a>)}</div><small>© 2026 KISHAN C. All rights reserved.</small></div></footer>
  </div>;
}
