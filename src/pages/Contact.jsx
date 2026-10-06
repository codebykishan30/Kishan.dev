import { useState } from 'react';
import { socials } from '../data/socials.js';
import { requireSupabase, supabaseConfigured } from '../lib/supabase.js';
import '../styles/contact.css';

export default function Contact() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabaseConfigured) {
      setError('The contact form is temporarily unavailable. Please email me directly instead.');
      setStatus('error');
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus('sending');
    setError('');
    try {
      const supabase = requireSupabase();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const { error: submitError } = await supabase
        .from('contact_requests')
        .insert({
          user_id: sessionData.session?.user?.id || null,
          name: String(data.get('name')).trim(),
          email: String(data.get('email')).trim(),
          subject: String(data.get('subject')).trim(),
          message: String(data.get('message')).trim(),
        });
      if (submitError) throw submitError;
      form.reset();
      setStatus('sent');
    } catch (submitError) {
      console.error('Unable to submit contact request:', submitError);
      setError('Your message could not be sent right now. Please try again or email me directly.');
      setStatus('error');
    }
  }

  return (
    <section className="section container contact-section" id="contact">
      <div className="contact-panel glass-card reveal">
        <div className="contact-copy">
          <p className="eyebrow">HAVE A PROJECT OR OPPORTUNITY?</p>
          <h2>Let’s make something<br /><span>worth using.</span></h2>
          <p>Open to internship opportunities, collaborations, and conversations about building useful products.</p>
          <a className="button button-primary" href="mailto:kishankishu9128@gmail.com">Get in touch <i className="bx bx-right-arrow-alt" /></a>
          <div className="social-links">{socials.map(([label, url, icon]) => <a href={url} key={label} target="_blank" rel="noreferrer" aria-label={label}><i className={`bx ${icon}`} /></a>)}</div>
        </div>
        <form className="contact-form" onSubmit={handleSubmit}>
          <label>Name<input name="name" required maxLength={100} autoComplete="name" placeholder="Your name" disabled={status === 'sending'} /></label>
          <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@example.com" disabled={status === 'sending'} /></label>
          <label>Subject<input name="subject" required maxLength={160} placeholder="What is this about?" disabled={status === 'sending'} /></label>
          <label>Message<textarea name="message" rows="4" required minLength={5} maxLength={5000} placeholder="What would you like to build?" disabled={status === 'sending'} /></label>
          <button className="button button-primary" type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send Message'} <i className="bx bx-send" /></button>
          {status === 'sent' && <p className="form-success" role="status">Thanks for reaching out. Your message was sent successfully.</p>}
          {status === 'error' && <p className="form-error" role="alert">{error} <a href="mailto:kishankishu9128@gmail.com">Email me</a></p>}
        </form>
      </div>
    </section>
  );
}
