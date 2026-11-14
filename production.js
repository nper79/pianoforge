'use strict';
const $ = s => document.querySelector(s);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let jobs=[],selected=null,lastRender='',capabilities={},busy=false;
const drafts=new Map();
async function api(path,body) {
  const response=await fetch('/api/production'+path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  let result;try{result=await response.json();}catch{throw Error('O painel precisa do servidor local atualizado. Abre a app no PC.');}
  if(!response.ok)throw Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}
function notice(message){$('#notice').textContent=message;$('#notice').classList.toggle('hidden',!message);}
function current(){return jobs.find(j=>j.id===selected);}
const fileLink=(job,role,label)=>job.assets[role]?`<a href="${escapeHTML(job.assets[role].url)}" download="${escapeHTML(job.assets[role].name)}">${escapeHTML(label)}</a>`:'';
const action=(stage,label,disabled=false)=>`<button class="btn" data-run="${stage}" ${disabled?'disabled':''}>${escapeHTML(label)}</button>`;
const upload=(role,label,disabled=false)=>`<button class="btn" data-upload="${role}" ${disabled?'disabled':''}>${escapeHTML(label)}</button>`;
function audio(job,role,label){return job.assets[role]?`<div class="audio-row"><span>${escapeHTML(label)}</span><audio controls preload="none" src="${escapeHTML(job.assets[role].url)}"></audio></div>`:'';}
function renderList(){
  $('#job-count').textContent=jobs.length;
  $('#job-list').innerHTML=jobs.length?jobs.map(j=>`<button class="job-card ${j.id===selected?'selected':''}" data-job="${j.id}" aria-pressed="${j.id===selected}"><strong>${escapeHTML(j.title)}</strong><small>${escapeHTML(j.task?j.task.label:j.state_label)}${j.error?' · verificar erro':''}</small></button>`).join(''):'<p class="field-help">As tuas músicas em preparação vão aparecer aqui.</p>';
}
function renderDetail(){
  const j=current();if(!j)return;
  const signature=j.id+':'+j.updated+':'+busy;
  if(signature===lastRender)return;
  const note=$('#review-note');if(note)drafts.set(note.dataset.job,note.value);
  lastRender=signature;
  const disabled=!!j.task||busy,a=j.assets;
  const done=[!!a.guide,!!a.audio,!!a.transcription,!!a.package_song,['approved','local_ready','published'].includes(j.state),j.state==='published'];
  const next=done.indexOf(false);
  const stages=['MIDI + guia','Gravação','Análise','Exercícios','Revisão','Site'];
  const error=j.error?`<div class="error-block" role="alert"><strong>A etapa não terminou.</strong><pre>${escapeHTML(j.error)}</pre>${j.failed_stage?action(j.failed_stage,'Repetir etapa',disabled):''}</div>`:'';
  const running=j.task?`${j.task.state==='queued'?'Na fila · ':''}${j.task.label}`:j.state_label;
  const ready=['approved','local_ready','published'].includes(j.state);
  const previews=Object.keys(a).filter(k=>/^preview_.+_piano$/.test(k));
  const versions=previews.map(k=>k.slice(8,-6));
  $('#job-detail').innerHTML=`
    <div class="job-heading"><div><h2>${escapeHTML(j.title)}</h2><p>${escapeHTML(j.brief.style)} · ${escapeHTML(j.brief.bpm)} BPM · ${escapeHTML(j.brief.level)}</p></div><span class="state-tag">${escapeHTML(running)}</span></div>
    <div class="workflow-score" aria-label="Etapas da produção">${stages.map((s,i)=>`<div class="workflow-note ${done[i]?'done':i===next?'current':''}"><i aria-hidden="true"></i><small>${escapeHTML(s)}${done[i]?' ✓':''}</small></div>`).join('')}</div>
    <p class="next-action">${escapeHTML(j.next_action)}</p>${error}
    <section class="production-section"><h3>1. Base musical e guia</h3><p>${escapeHTML(j.brief.skills)}</p>
      <div class="production-actions">${action('base',a.guide?'Recriar guia':'Preparar MIDI e guia',disabled)}${upload('midi','Importar outro MIDI',disabled)}</div>
      ${audio(j,'guide','Guia de piano')}
      <div class="file-links">${fileLink(j,'guide_midi','Descarregar MIDI')}${fileLink(j,'guide','Descarregar guia')}${fileLink(j,'prompt','Descarregar prompt')}</div>
    </section>
    <section class="production-section"><h3>2. Gravação gerada</h3><p>Usa o guia e o prompt no gerador escolhido. Importa aqui a gravação final; ela será a referência dos exercícios.</p>
      <div class="production-actions">${upload('audio',a.audio?'Substituir gravação':'Importar gravação',disabled)}</div>${audio(j,'audio','Gravação')}
      ${j.duration?`<p>Duração: ${Math.round(j.duration)} segundos.</p>`:''}
    </section>
    <section class="production-section"><h3>3. Transcrição e voz</h3><p>A transcrição e a separação usam a tua conta Modal e têm custos de GPU. Os resultados ficam guardados para reutilização.</p>
      <div class="production-actions">${action('analyze',a.transcription?'Reutilizar transcrição':'Transcrever · GPU',disabled||!j.duration)}${action('separate',a.vocals?'Reutilizar voz':'Separar voz · GPU',disabled||!j.duration)}</div>
      ${audio(j,'vocals','Voz isolada')}
      <div class="file-links">${fileLink(j,'score','Partitura ABC')}${fileLink(j,'transcription','Notas e partes')}${fileLink(j,'analysis_report','Dados da transcrição')}</div>
    </section>
    <section class="production-section"><h3>4. Arranjo musical</h3><p>Esta etapa ainda precisa de análise musical, como fizemos em Lantern Road. O pedido reúne o objetivo e a referência da gravação para preparar uma proposta com motivos reconhecíveis.</p>
      <div class="file-links">${fileLink(j,'arrangement_request','Descarregar pedido de arranjo')}${fileLink(j,'arrangement','Proposta recebida')}</div>
      <div class="production-actions">${upload('arrangement','Importar exercícios propostos',disabled||!j.duration)}${a.arrangement?action('arrange','Verificar e recriar prévias',disabled):''}</div>
    </section>
    ${a.package_song?`<section class="production-section"><h3>5. Ouvir e rever</h3><div class="preview-heading"><label for="preview-version">Versão</label><select id="preview-version">${versions.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(j.exercise_names?.[v]||v)}</option>`).join('')}</select></div>
      <div id="preview-audio"></div><p>Confirma que o tema continua reconhecível e que o ritmo, as pausas e as mudanças de mão servem a lição.</p>
      <label for="review-note" class="field-help">O que ficou bem ou precisa de mudar?</label><textarea id="review-note" data-job="${j.id}" class="review-note" maxlength="2000">${escapeHTML(drafts.get(j.id)||'')}</textarea>
      <div class="production-actions"><button class="btn primary" data-review="approve" ${disabled?'disabled':''}>Aprovar arranjo</button><button class="btn" data-review="revise" ${disabled?'disabled':''}>Registar alterações necessárias</button></div>
      <details><summary>Verificações e limites desta avaliação</summary><p>${escapeHTML(j.validation?.warning||'')}</p><div class="file-links">${fileLink(j,'validation','Relatório de execução')}</div></details>
    </section>
    <section class="production-section"><h3>6. Biblioteca e publicação</h3><p>${ready?'O arranjo está aprovado para preparar o catálogo.':'Aprova o arranjo antes de o adicionar à biblioteca ou publicar.'}</p>
      <div class="production-actions">${action('local',j.state==='local_ready'?'Atualizar biblioteca local':'Adicionar à biblioteca local',disabled||!ready)}${action('publish','Publicar este pacote',disabled||!ready||!capabilities.remote_publish)}</div>
      <div class="file-links">${fileLink(j,'package_zip','Descarregar pacote do site')}${fileLink(j,'package_song','Descarregar música JSON')}</div>
      ${!capabilities.remote_publish?'<p>A publicação remota ainda não está configurada neste servidor. O pacote pode ser descarregado e a biblioteca local já pode ser usada.</p>':''}
    </section>`:''}
    <section class="production-section"><details><summary>Histórico e ficheiros de diagnóstico</summary><ol class="history">${[...j.events].reverse().slice(0,20).map(e=>`<li><time>${new Date(e.time*1000).toLocaleString('pt-PT')}</time>${escapeHTML(e.message)}</li>`).join('')}</ol><div class="file-links">${Object.keys(a).filter(k=>k.startsWith('log_')).map(k=>fileLink(j,k,k.replace('log_','Registo · '))).join('')}</div></details></section>`;
  $('#preview-version')?.addEventListener('change',renderPreview);
  renderPreview();
}
function renderPreview(){
  const j=current(),selector=$('#preview-version');if(!j||!selector)return;
  const key=selector.value;
  $('#preview-audio').innerHTML=audio(j,`preview_${key}_voz`,'Voz + piano')+audio(j,`preview_${key}_original`,'Música + piano')+audio(j,`preview_${key}_piano`,'Só piano');
}
async function refresh(){
  const result=await api('/jobs');jobs=result.jobs;
  if(!selected||!jobs.some(j=>j.id===selected))selected=jobs[0]?.id;
  renderList();renderDetail();
}
async function perform(fn){
  if(busy)return;busy=true;notice('');renderDetail();
  try{await fn();await refresh();}catch(error){notice(error.message);}finally{busy=false;lastRender='';renderDetail();}
}
function openDialog(){$('#form-error').textContent='';$('#job-dialog').showModal();$('#job-form [name=title]').focus();}
$('#new-job').onclick=openDialog;$('#empty-new').onclick=openDialog;
$('#close-dialog').onclick=$('#cancel-dialog').onclick=()=>$('#job-dialog').close();
$('#job-list').onclick=event=>{
  const button=event.target.closest('[data-job]');if(!button)return;
  const note=$('#review-note');if(note)drafts.set(note.dataset.job,note.value);
  selected=button.dataset.job;lastRender='';renderList();renderDetail();
};
$('#job-form').onsubmit=async event=>{
  event.preventDefault();const button=$('#create-job');button.disabled=true;
  try{
    const values=Object.fromEntries(new FormData(event.target));values.bpm=+values.bpm;
    const job=await api('/jobs',values);selected=job.id;$('#job-dialog').close();
    await api(`/jobs/${job.id}/run`,{stage:'base'});await refresh();
  }catch(error){$('#form-error').textContent=error.message;notice(error.message);}finally{button.disabled=false;}
};
$('#job-detail').onclick=event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.run)perform(()=>api(`/jobs/${selected}/run`,{stage:button.dataset.run}));
  if(button.dataset.review){
    const notes=$('#review-note')?.value||'';
    perform(()=>api(`/jobs/${selected}/review`,{decision:button.dataset.review,notes}));
  }
  if(button.dataset.upload){
    const input=$('#production-upload');input.dataset.role=button.dataset.upload;
    input.accept={midi:'.mid,.midi',audio:'.mp3,.wav,.m4a,.ogg,.flac',arrangement:'.json'}[button.dataset.upload];
    input.value='';input.click();
  }
};
$('#production-upload').onchange=event=>{
  const input=event.target,file=input.files[0],role=input.dataset.role,jid=selected;if(!file)return;
  if(file.size>40*1024*1024){notice('O limite por ficheiro é 40 MB.');return;}
  perform(async()=>{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Não foi possível ler o ficheiro.'));reader.readAsDataURL(file);});
    await api(`/jobs/${jid}/upload`,{role,name:file.name,data});
  });
};
async function poll(){
  if(!document.hidden&&!busy)try{await refresh();}catch(error){notice(error.message);}
  setTimeout(poll,jobs.some(j=>j.task)?2000:8000);
}
(async()=>{
  try{capabilities=(await api('')).capabilities;await refresh();}catch(error){notice(error.message);$('#new-job').disabled=true;}
  setTimeout(poll,2000);
})();
