"use client";

import { useRef, useState } from "react";
import { Mic, MicOff, Send, Sparkles, LoaderCircle, Check, X } from "lucide-react";
import { ExtractionProposal, HealthExtraction, type ExtractionProposal as Proposal, type HealthExtraction as Extraction } from "@/lib/ai/schemas/extraction";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((event: RecognitionEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export default function AICoach() {
  const [text, setText] = useState("");
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [drafts, setDrafts] = useState<Proposal[]>([]);
  const [editJson, setEditJson] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  function toggleVoice() {
    setError("");
    if (recording) { recognition.current?.stop(); setRecording(false); return; }
    const Speech = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Speech) { setError("Voice typing is not available in this browser. Try Chrome or use your device keyboard’s microphone."); return; }
    const instance = new Speech();
    instance.lang = navigator.language || "en-IN";
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = event => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += `${event.results[i][0].transcript} `;
      setText(previous => `${previous.trim()} ${transcript.trim()}`.trim());
    };
    instance.onerror = () => { setError("Could not access speech input. Check microphone permission and try again."); setRecording(false); };
    instance.onend = () => setRecording(false);
    recognition.current = instance;
    try { instance.start(); setRecording(true); } catch { setError("Voice input could not start. Try again or type your note."); }
  }

  async function review() {
    if (text.trim().length < 2) return;
    setError(""); setStatus(""); setBusy(true); setExtraction(null); setDrafts([]);
    try {
      const response = await fetch("/api/ai/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not review that note.");
      const checked = HealthExtraction.safeParse(body.extraction);
      if (!checked.success) throw new Error("The drafts could not be validated. Please try a shorter, clearer note.");
      setExtraction(checked.data); setDrafts(checked.data.events); setEditJson(checked.data.events.map(event => JSON.stringify(event, null, 2)));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not review that note."); }
    finally { setBusy(false); }
  }

  async function confirm(index: number) {
    setError(""); setStatus("");
    let parsed: unknown;
    try { parsed = JSON.parse(editJson[index] ?? ""); } catch { setError("This edited draft is not valid JSON. Restore the original draft or fix the syntax."); return; }
    const checked = ExtractionProposal.safeParse(parsed);
    if (!checked.success) { setError("Please keep the draft structure valid and use supported values."); return; }
    setSavingIndex(index);
    try {
      const response = await fetch("/api/ai/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposal: checked.data }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not save the confirmed entry.");
      const remaining = drafts.filter((_, i) => i !== index);
      setDrafts(remaining); setEditJson(values => values.filter((_, i) => i !== index));
      if (!remaining.length) { setStatus("All approved entries were saved to your private health record."); setExtraction(null); setText(""); }
      else setStatus(`${checked.data.domain[0].toUpperCase()}${checked.data.domain.slice(1)} entry saved. Review the remaining draft${remaining.length === 1 ? "" : "s"} when ready.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the confirmed entry."); }
    finally { setSavingIndex(null); }
  }

  function reject(index: number) {
    const remaining = drafts.filter((_, i) => i !== index);
    setDrafts(remaining); setEditJson(values => values.filter((_, i) => i !== index));
    if (!remaining.length) { setExtraction(null); setStatus("Drafts rejected. Nothing further was saved."); }
  }

  return <>
    <div className="greeting"><div><div className="eyebrow">YOUR PERSONAL COACH</div><h1>Tell me what’s going on.</h1><p className="subcopy">Talk or type about meals, training, sleep, health, or how you’re feeling. Review each entry before it is saved.</p></div></div>
    <div className="card coach-panel">
      <div className="message"><b><Sparkles size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Your coach listens, then checks with you.</b><br/>One update can include several things—a meal, a run, and how you feel. I’ll separate them into individual drafts for you to review.</div>
      {extraction && <div className="confirm-card"><b>TRANSCRIPT REVIEW</b><p style={{ color: "#66736a", lineHeight: 1.6, marginBottom: 4 }}>{extraction.corrected_transcript}</p><div className="card-kicker" style={{ marginBottom: 12 }}>Corrected spelling where the intended words were clear. Check the transcript and each event below.</div>{drafts.map((draft,index)=><section key={`${draft.domain}-${index}`} style={{borderTop:"1px solid #e8ece4",paddingTop:13,marginTop:12}}><b>{draft.domain.toUpperCase()} · {draft.event_type}</b><p style={{color:"#66736a",fontSize:12,lineHeight:1.5}}>{draft.corrected_understanding}</p><div className="card-kicker" style={{marginBottom:8}}>Extraction confidence {Math.round(draft.confidence*100)}% · not a medical confidence score</div><label style={{display:"grid",gap:6,fontSize:10,color:"#657168"}}>Edit details before saving<textarea value={editJson[index]??""} onChange={e=>setEditJson(values=>values.map((value,i)=>i===index?e.target.value:value))} rows={7} style={{border:"1px solid #dfe8ce",borderRadius:9,padding:10,fontFamily:"monospace",fontSize:10,whiteSpace:"pre",overflowX:"auto"}}/></label><div className="confirm-actions"><button className="button-primary" disabled={savingIndex!==null} onClick={()=>void confirm(index)}>{savingIndex===index?<LoaderCircle size={13} className="spin"/>:<Check size={13} style={{verticalAlign:"middle",marginRight:5}}/>}Confirm & save this entry</button><button className="button-secondary" disabled={savingIndex!==null} onClick={()=>reject(index)}><X size={13} style={{verticalAlign:"middle",marginRight:5}}/>Reject this entry</button></div></section>)}<p className="card-kicker" style={{marginTop:12}}>Meal nutrition remains estimated when labeled. Lab results must be checked against and saved with the uploaded source report.</p></div>}
      <div className="example-prompts"><span className="card-kicker">Try an example (fictional)</span><button className="example-chip" onClick={() => setText("I jad two eggs for breakfast, went for a 2 km run, and I am feeling low after a breakup.")}>Meal + run + feeling low</button><button className="example-chip" onClick={() => setText("I slept about five hours and feel tired today.")}>Sleep + fatigue</button></div>
      <div className="compose"><textarea aria-label="Describe a health or performance update" placeholder="For example: I had two eggs for breakfast. I slept badly and feel low today…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void review(); } }} /><button className={`icon-button ${recording ? "recording" : ""}`} onClick={toggleVoice} aria-label={recording ? "Stop voice input" : "Start voice input"} title={recording ? "Stop voice input" : "Start voice input"}>{recording ? <MicOff size={16} /> : <Mic size={16} />}</button><button className="button-primary" onClick={() => void review()} disabled={busy || !text.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <><Send size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Review</>}</button></div>
      {recording && <div role="status" className="card-kicker">Listening… speak naturally, then pause.</div>}{error && <div role="alert" style={{ color: "#a1483e", fontSize: 11 }}>{error}</div>}{status && <div role="status" style={{ color: "#537249", fontSize: 11 }}>{status}</div>}
      <div style={{ fontSize: 10, color: "#8a958d" }}>Voice dictation is handled by your browser or device speech service. Your transcribed note is sent to the configured AI service only when you press Review. Nothing is saved until you confirm each entry.</div>
    </div>
  </>;
}
