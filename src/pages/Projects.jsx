import { useState } from 'react';

export default function Projects({ projects, contentError }) {
  const [filter, setFilter] = useState('All');
  const categories = [...new Set(projects.map((project) => project.category).filter(Boolean))];
  const visibleProjects = projects.filter((project) => filter === 'All' || project.category === filter);

  return (
    <section className="section container" id="projects">
      <div className="section-heading section-heading-row reveal">
        <div><p className="eyebrow">SELECTED BUILDS</p><h2>Projects<span>.</span></h2></div>
        <a className="text-link" href="https://github.com/Kishan-devflow" target="_blank" rel="noreferrer">GitHub profile <i className="bx bx-right-arrow-alt" /></a>
      </div>
      {categories.length > 0 && <div className="filters" role="group" aria-label="Filter projects">{['All', ...categories].map((item) => (
        <button key={item} className={filter === item ? 'filter-button selected' : 'filter-button'} onClick={() => setFilter(item)}>{item}</button>
      ))}</div>}
      {visibleProjects.length > 0 ? <div className="projects-grid">{visibleProjects.map((project, index) => (
        <article className="project-card glass-card reveal" key={project.id}>
          <div className="project-image">{project.image_url && <img src={project.image_url} loading="lazy" alt={`${project.title} preview`} />}<span className="project-index">{String(index + 1).padStart(2, '0')}</span></div>
          <div className="project-body">
            <div className="project-title-row"><h3>{project.title}</h3>{project.github_url && <a href={project.github_url} target="_blank" rel="noreferrer" aria-label={`Open ${project.title} GitHub repository`}><i className="bx bx-link-external" /></a>}</div>
            <p>{project.short_description}</p>
            <div className="project-bottom"><div className="project-stack">{(project.technologies || []).map((technology) => <span key={technology}>{technology}</span>)}</div><span className="project-category">{project.category}</span></div>
            {project.live_url && <a className="text-link" href={project.live_url} target="_blank" rel="noreferrer">Visit live project <i className="bx bx-right-arrow-alt" /></a>}
          </div>
        </article>
      ))}</div> : contentError ? <p className="public-error-note" role="status">Portfolio content is temporarily unavailable. Please check the Supabase database setup.</p> : <p className="public-empty-note">New projects are on the way.</p>}
    </section>
  );
}
