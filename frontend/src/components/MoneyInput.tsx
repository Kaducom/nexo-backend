import {forwardRef,useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type InputHTMLAttributes} from 'react';
import {digitsToCents,formatCents,pasteCents} from '../finance/money';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'inputMode'> & {value:number|null;onValueChange:(cents:number|null)=>void};
export default forwardRef<HTMLInputElement,Props>(function MoneyInput({value,onValueChange,onKeyDown,onPaste,onFocus,...props},ref){
  const input=useRef<HTMLInputElement>(null), caret=useRef<number|null>(null);
  const [revision,render]=useState(0),[error,setError]=useState('');
  useImperativeHandle(ref,()=>input.current!);
  const display=value===null?'':formatCents(value);
  useLayoutEffect(()=>{input.current?.setCustomValidity(error);},[error]);
  useLayoutEffect(()=>{if(caret.current!==null&&input.current){input.current.setSelectionRange(caret.current,caret.current);caret.current=null;}},[value,revision]);
  function commit(digits:string,position:number){
    const cents=digitsToCents(digits);
    if(cents===null){setError('Valor máximo: R$ 9.999.999.999,99.');return;}
    const formatted=digits?formatCents(cents):'';
    const remaining=digits.length-position;
    let target=formatted.length;
    for(let i=formatted.length-1,left=remaining;i>=0&&left>0;i--){if(/\d/.test(formatted[i])){left--;target=i;}}
    caret.current=target;setError('');onValueChange(digits?cents:null);render(n=>n+1);
  }
  function replace(text:string,mode='insert'){
    const el=input.current!;const raw=el.value.replace(/\D/g,'');
    let start=el.value.slice(0,el.selectionStart??el.value.length).replace(/\D/g,'').length;
    let end=el.value.slice(0,el.selectionEnd??el.value.length).replace(/\D/g,'').length;
    if(start===end){if(mode==='back')start=Math.max(0,start-1);if(mode==='delete')end=Math.min(raw.length,end+1);}
    commit(raw.slice(0,start)+text+raw.slice(end),start+text.length);
  }
  // Native beforeinput covers mobile keyboards, where keydown is often absent.
  useEffect(()=>{
    const el=input.current!;
    const before=(event:InputEvent)=>{
      if(!event.cancelable)return;
      if(event.inputType==='insertText'&&event.data!==null){event.preventDefault();if(/^\d+$/.test(event.data))replace(event.data);}
      else if(event.inputType==='deleteContentBackward'||event.inputType==='deleteContentForward'){event.preventDefault();replace('',event.inputType==='deleteContentBackward'?'back':'delete');}
    };
    el.addEventListener('beforeinput',before);return()=>el.removeEventListener('beforeinput',before);
  });
  return <><input {...props} ref={input} type="text" inputMode="numeric" autoComplete="off" value={display} placeholder={props.placeholder??'R$ 0,00'} aria-invalid={!!error||props['aria-invalid']}
    onFocus={e=>{onFocus?.(e);}}
    onKeyDown={e=>{onKeyDown?.(e);if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.altKey)return;if(/^\d$/.test(e.key)){e.preventDefault();replace(e.key);}else if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();replace('',e.key==='Backspace'?'back':'delete');}else if(e.key.length===1)e.preventDefault();}}
    onBeforeInput={e=>{const native=e.nativeEvent as InputEvent;if(native.inputType==='deleteContentBackward'||native.inputType==='deleteContentForward'){e.preventDefault();replace('',native.inputType.endsWith('Backward')?'back':'delete');}}}
    onChange={e=>{const text=e.target.value;const before=text.slice(0,e.target.selectionStart??text.length).replace(/\D/g,'').length;commit(text.replace(/\D/g,''),before);}}
    onPaste={e=>{onPaste?.(e);if(e.defaultPrevented)return;e.preventDefault();const cents=pasteCents(e.clipboardData.getData('text'));if(cents===null){setError('Cole um valor válido, como R$ 1.469,08.');return;}replace(String(cents));}}
  />{error&&<small role="alert" className="money-error">{error}</small>}</>;
});
