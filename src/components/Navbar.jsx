import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabaseConfigured } from '../lib/supabase-env.js';

const items = [
  ['Home', '/'],
  ['About', '/about'],
  ['Experience', '/experience'],
  ['Skills', '/skills'],
  ['Projects', '/projects'],
  ['Contact', '/contact'],
];

export default function Navbar() {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [account, setAccount] = useState(null);
  const headerRef = useRef(null);

  useEffect(() => {
    setActiveSection(location.pathname);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.pathname]);

  useEffect(() => {
    const page = items.find(([, path]) => path === location.pathname);
    const section = page && document.getElementById(page[1].slice(1) || 'home');
    const sections = section ? [section] : [];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(location.pathname);
    }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.15, 0.35, 0.6] });
    sections.forEach((section) => observer.observe(section));

    const updateScroll = () => {
      setScrolled(window.scrollY > 12);
    };
    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScroll);
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscapeOrOutside = (event) => {
      if (event.type === 'keydown' && event.key === 'Escape') setMenuOpen(false);
      if (event.type === 'pointerdown' && !headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscapeOrOutside);
    document.addEventListener('pointerdown', closeOnEscapeOrOutside);
    return () => {
      document.removeEventListener('keydown', closeOnEscapeOrOutside);
      document.removeEventListener('pointerdown', closeOnEscapeOrOutside);
    };
  }, [menuOpen]);

  // Track the signed-in account and its public.profiles role. The account
  // module is imported on demand so the Supabase client stays out of the
  // initial public bundle.
  useEffect(() => {
    if (!supabaseConfigured) {
      setAccount({ status: 'unconfigured', session: null, role: null });
      return undefined;
    }
    let active = true;
    let unsubscribe;
    import('../lib/account.js').then(({ subscribeAccount }) => {
      if (!active) return;
      unsubscribe = subscribeAccount((next) => { if (active) setAccount(next); });
    }).catch(() => {});
    return () => {
      active = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      const { requireSupabase } = await import('../lib/supabase.js');
      await requireSupabase().auth.signOut();
    } catch {
      // The auth listener refreshes the menu on its own.
    }
  }

  const signedIn = Boolean(account?.session);
  const isAdmin = account?.role === 'admin';

  const closeMenu = () => setMenuOpen(false);
  return (
    <header ref={headerRef} className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container nav-wrap">
        <Link className="brand-logo" to="/" onClick={closeMenu} aria-label="Kishan C home">
          KISHAN<span>.</span>
        </Link>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <i className={`bx ${menuOpen ? 'bx-x' : 'bx-menu'}`} aria-hidden="true" />
        </button>
        <nav id="primary-navigation" className={`nav-links${menuOpen ? ' open' : ''}`} aria-label="Main navigation">
          {items.map(([label, id]) => (
            <Link
              key={id}
              to={id}
              className={activeSection === id ? 'active' : undefined}
              aria-current={activeSection === id ? 'page' : undefined}
              onClick={closeMenu}
            >
              {label}
            </Link>
          ))}
          <Link className="mobile-talk" to="/contact" onClick={closeMenu}>Let’s Talk</Link>
          {account && (signedIn ? (
            <>
              <Link className="mobile-signin mobile-account-profile" to="/profile" onClick={closeMenu}><i className="bx bx-user" aria-hidden="true" /> My profile</Link>
              {isAdmin && <Link className="mobile-signin mobile-account-admin" to="/admin" onClick={closeMenu}><i className="bx bx-grid-alt" aria-hidden="true" /> Admin dashboard</Link>}
              <button className="mobile-signin mobile-signout" type="button" onClick={() => { closeMenu(); signOut(); }}><i className="bx bx-log-out" aria-hidden="true" /> Sign out</button>
            </>
          ) : (
            <>
              <Link className="mobile-signin" to="/signin" onClick={closeMenu}>Login <i className="bx bx-right-arrow-alt" aria-hidden="true" /></Link>
              <Link className="mobile-signin" to="/register" onClick={closeMenu}>Create account <i className="bx bx-user-plus" aria-hidden="true" /></Link>
            </>
          ))}
        </nav>
        <div className="nav-actions">
          {account && (signedIn ? (
            <div className="nav-account-controls">
              <Link className="nav-account-profile" to="/profile"><i className="bx bx-user" aria-hidden="true" /> Profile</Link>
              {isAdmin && <Link className="nav-signin nav-account-admin" to="/admin">Admin dashboard</Link>}
              <button className="nav-account-signout" type="button" onClick={signOut}><i className="bx bx-log-out" aria-hidden="true" /><span>Sign out</span></button>
            </div>
          ) : (
            <>
              <Link className="nav-signin" to="/signin">Login</Link>
              <Link className="nav-signin" to="/register">Create account</Link>
            </>
          ))}
          <Link className="nav-talk" to="/contact">Let’s Talk <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </header>
  );
}
