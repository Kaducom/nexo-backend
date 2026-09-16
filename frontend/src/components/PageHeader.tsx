type Props = {
  eyebrow?: string;
  title: string;
  description: string;
};

export default function PageHeader({ eyebrow, title, description }: Props) {
  return (
    <header className="page-header">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
