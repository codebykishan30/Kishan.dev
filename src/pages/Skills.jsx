export default function Skills({ skills }) {
  const groups = Object.entries((skills || []).reduce((result, skill) => {
    result[skill.category] = [...(result[skill.category] || []), skill.name];
    return result;
  }, {}));

  return (
    <section className="section container" id="skills">
      <div className="section-heading reveal"><p className="eyebrow">TOOLS OF THE TRADE</p><h2>Technical skills<span>.</span></h2></div>
      {groups.length > 0 && <div className="skills-grid">{groups.map(([group, items], index) => (
        <article className="skill-card glass-card reveal" key={group}>
          <div className="skill-number">0{index + 1}</div><h3>{group}</h3>
          <div className="skill-list">{items.map((item) => <span key={item}><i className="bx bx-check" />{item}</span>)}</div>
        </article>
      ))}</div>}
    </section>
  );
}
