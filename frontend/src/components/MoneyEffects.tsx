import {useEffect, useState, type CSSProperties} from 'react';

type Kind = 'income' | 'expense' | 'saving';
export function celebrateMoney(type: 'income' | 'expense', description = '') {
  const saving = /\b(reserva|poupan[cç]a|guardei|guardar|investimento)\b/i.test(description);
  window.dispatchEvent(new CustomEvent('nexo:money-saved', {detail: saving ? 'saving' : type}));
}

export default function MoneyEffects() {
  const [effect, setEffect] = useState<{kind: Kind; id: number} | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (event: Event) => {
      const kind = (event as CustomEvent<Kind>).detail;
      if (!['income', 'expense', 'saving'].includes(kind)) return;
      clearTimeout(timer);
      setEffect({kind, id: Date.now()});
      timer = setTimeout(() => setEffect(null), 2100);
    };
    window.addEventListener('nexo:money-saved', show);
    return () => { clearTimeout(timer); window.removeEventListener('nexo:money-saved', show); };
  }, []);
  if (!effect) return null;
  const expense = effect.kind === 'expense';
  return <div key={effect.id} className={`money-effect ${effect.kind}`}>
    <div className="money-effect-particles" aria-hidden="true">
      {Array.from({length: expense ? 12 : 36}, (_, i) => {
        const angle = (i % 12) / 12 * Math.PI * 2;
        return <i key={i} style={{'--x': `${Math.cos(angle) * (85 + i % 5 * 15)}px`, '--y': `${Math.sin(angle) * (85 + i % 5 * 15)}px`, '--left': `${expense ? 15 + i * 6 : 25 + Math.floor(i / 12) * 25}%`, '--delay': `${(i % 4) * 75}ms`, '--hue': `${expense ? 40 : 145 + i * 7}`} as CSSProperties}>{expense ? '●' : ''}</i>;
      })}
    </div>
    <div className="money-effect-message" role="status">{effect.kind === 'saving' ? 'Um passo a mais para sua reserva ✨' : expense ? 'Gasto registrado' : 'Dinheiro recebido ✨'}</div>
  </div>;
}
