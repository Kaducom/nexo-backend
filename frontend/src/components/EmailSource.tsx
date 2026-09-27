export default function EmailSource({provider}:{provider?:'gmail'|'icloud'}){
  return provider?<span className={`email-source ${provider}`}>{provider==='gmail'?'Gmail':'Mail · iCloud'}</span>:null;
}
