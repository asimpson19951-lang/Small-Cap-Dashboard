import {createReplayView, normalizeDate, isFiniteNumber} from '../memory-replay-20260904/view-model.mjs';

const finite = isFiniteNumber;
const empty = value => value == null ? null : value;
export const signed = value => finite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(1)}%` : 'Unavailable';
export const number = value => finite(value) ? value.toLocaleString('en-US', {maximumFractionDigits:2}) : 'Unavailable';

function day(value, data) {
  if (!normalizeDate(value) || value < data.windowStart || value > data.windowEnd) throw Error('Choose valid dates inside the available replay window.');
  return value;
}
function snapshot(member) {
  const row = member?.latest;
  return {
    session: row?.date || null, close: finite(row?.close) ? row.close : null,
    dayPct: finite(row?.return1dPct) ? row.return1dPct : null,
    dCount: finite(row?.dCount) ? row.dCount : null, dStatus: row?.dStatus || 'unknown',
    bbPositionPct: finite(row?.bbPositionPct) ? row.bbPositionPct : null,
    band: member?.bandState?.label || 'Unknown',
    volume: finite(row?.volume) ? row.volume : null,
  };
}
const easternDay = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
function sourceDay(value) {
  if (normalizeDate(value)) return value; // Date-only provenance is a conservative Eastern calendar-day boundary.
  const match = typeof value==='string' && value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match || !normalizeDate(match[1]) || +match[2]>23 || +match[3]>59 || +match[4]>59 || +match[6]>14 || +match[7]>59 || (+match[6]===14 && +match[7]!==0)) return null;
  const instant=new Date(value);
  if(!Number.isFinite(instant.getTime()))return null;
  const parts=Object.fromEntries(easternDay.formatToParts(instant).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function eligible(item, cutoff) {
  if (!['reviewed','accepted'].includes(String(item?.reviewStatus).toLowerCase()) || !normalizeDate(item?.availableDate) || item.availableDate > cutoff) return false;
  if (!normalizeDate(item.eventDate || item.availableDate) || (item.eventDate || item.availableDate) > cutoff) return false;
  return Array.isArray(item.sources) && item.sources.length > 0 && item.sources.every(source => {
    try {
      return new URL(source.url).protocol === 'https:' && [source.publishedAt,source.updatedAt].filter(Boolean).every(at => {
        const date = sourceDay(at);
        return date && date <= cutoff && date <= item.availableDate;
      }) && Boolean(source.publishedAt);
    } catch { return false; }
  });
}

/** One immutable, dated evidence packet. Both display modes consume this result. */
export function buildComparisonPacket(data, evidence, from, to) {
  if (!data || !Array.isArray(data.members) || !normalizeDate(data.windowStart) || !normalizeDate(data.windowEnd)) throw Error('Local daily data is unavailable.');
  day(from, data); day(to, data);
  if (from > to) throw Error('The comparison start must not be after its end.');
  const accepted = { ...evidence,
    checkpoints:(evidence?.checkpoints || []).filter(item => eligible(item,to)),
    relationships:(evidence?.relationships || []).filter(item => eligible(item,to)),
  };
  const before = createReplayView(data,accepted,from,'SNDK');
  const after = createReplayView(data,accepted,to,'SNDK');
  const oldIds = new Set(before.evidenceItems.map(item=>item.id));
  const newEvidence = after.evidenceItems.filter(item=>!oldIds.has(item.id));
  const members = after.members.map(member => {
    const old = before.members.find(item=>item.ticker===member.ticker);
    const start = snapshot(old), end = snapshot(member);
    const periodPct = finite(start.close) && start.close > 0 && finite(end.close) ? (end.close / start.close - 1) * 100 : null;
    const relevant = after.evidenceItems.filter(item=>(item.tickers || []).includes(member.ticker));
    const changes = newEvidence.filter(item=>(item.tickers || []).includes(member.ticker));
    return {
      ticker:member.ticker, name:member.name, role:member.role, membershipStatus:member.membershipStatus,
      before:start, after:end, periodPct,
      relationship:member.relationship,
      relationshipChange:member.relationship?.availableDate > from ? member.relationship : null,
      changes, context:relevant,
      explanationState:changes.length ? 'Reviewed developments available' : 'No new explanation in this reviewed source set',
      unknowns:[member.relationship?.caveat || 'Relationship evidence unavailable by cutoff.', 'Historical admission/removal timing is unproved; candidate selection is retrospective.'],
    };
  }).sort((a,b)=>(finite(b.periodPct)?Math.abs(b.periodPct):-1)-(finite(a.periodPct)?Math.abs(a.periodPct):-1)||a.ticker.localeCompare(b.ticker));
  const summary = [
    `${newEvidence.length} reviewed development${newEvidence.length===1?'':'s'} became available between ${from} and ${to}.`,
    ...members.filter(member=>['SNDK','MU'].includes(member.ticker)).map(member => `${member.ticker}: ${signed(member.periodPct)} between observed closes on ${member.before.session || 'unknown'} and ${member.after.session || 'unknown'}; ${member.after.band.toLowerCase()} at the latter close.`),
  ];
  return {
    schemaVersion:1, theme:'Memory', from, to,
    cutoffConvention:'End of day America/New_York; completed daily bars. Historical reconstruction, not an actual morning edition.',
    summary, members, newEvidence, context:after.evidenceItems,
    membership:{state:'unknown',added:null,removed:null,explanation:'Historical roster changes cannot be recovered from a retrospective candidate list.'},
    participation:{before:before.coverage,after:after.coverage},
    coverage:{candidates:members.length,compared:members.filter(member=>finite(member.periodPct)).length,
      sourceState:evidence && ['reviewed','accepted'].includes(evidence.reviewStatus)?'reviewed_retrospective':'partial',
      exclusions:(evidence?.checkpoints || []).filter(item=>(!normalizeDate(item?.availableDate)||item.availableDate<=to)&&!eligible(item,to)).map(item=>({id:empty(item?.id),reason:'Review, date or source provenance did not pass'})),
      unavailableLanes:['Live morning source packet','Trade Ideas','Complete historical membership','Exhaustive company-specific news'],
    },
    limitations:[...(evidence?.limitations || []),...(data.source?.limitations || [])],
  };
}

export function participationText(packet) {
  return ['before','after'].map(phase=>{
    const census=packet.participation[phase];
    const date=phase==='before'?packet.from:packet.to;
    if(!census.bandValid) return `${date}: band census unavailable (0/${census.candidates} candidates measured).`;
    return `${date}: ${census.outsideUpper}/${census.bandValid} measured candidates closed above the upper band; ${census.outsideLower}/${census.bandValid} below the lower band. ${census.bandValid}/${census.candidates} candidate coverage on ${census.bandSession || 'unknown session'}.`;
  });
}

export function memberEvidence(member) { return member.changes.length ? member.changes : member.context.slice(-1); }
export function briefText(packet) {
  const lines=[`Memory replay briefing | ${packet.to}`,packet.cutoffConvention,'',...packet.summary,'','WHAT CHANGED'];
  for (const event of packet.newEvidence) {
    lines.push(`${event.availableDate} | ${event.kind==='attribution'?'Attributed narrative':'Documented development'} | ${event.title}`,event.summary,event.caveat,...event.sources.map(source=>`${source.title}: ${source.url}`),'');
  }
  lines.push('CANDIDATE BAND PARTICIPATION',...participationText(packet),'Retrospective candidates, not a proven historical theme roster.','', 'STOCKS IN CONTEXT');
  for (const member of packet.members) {
    lines.push(`${member.ticker} — ${member.name} | ${signed(member.periodPct)} over the observed comparison`,
      member.relationship?.summary || 'Company relationship evidence unavailable by this cutoff.',
      `Observed close ${number(member.after.close)} on ${member.after.session || 'unknown'}; 1D ${signed(member.after.dayPct)}; BB position ${signed(member.after.bbPositionPct)}; D ${member.after.dCount ?? 'unknown'} (${member.after.dStatus}).`,
      member.explanationState,...member.unknowns,
      ...(member.relationship?.sources || []).map(source=>`${source.title}: ${source.url}`),'');
    for(const event of memberEvidence(member))lines.push(
      `${event.availableDate} | ${event.kind==='attribution'?'Attributed narrative':'Documented development'} | ${event.title}`,
      event.summary,event.caveat||'',...event.sources.map(source=>`${source.title}: ${source.url}`),'');
  }
  lines.push('COVERAGE',`${packet.coverage.compared}/${packet.coverage.candidates} candidate comparisons. ${packet.membership.explanation}`,
    `Unavailable: ${packet.coverage.unavailableLanes.join('; ')}.`,
    `Source state: ${packet.coverage.sourceState}.`,
    'BB position: 0% is the lower band; 100% the upper band. D-count uses existing doctrine, including lower-bound readings. Neither is a trade instruction.',
    '', 'SOURCE LIMITATIONS',...packet.limitations,
    '', 'EXCLUDED EVIDENCE',...packet.coverage.exclusions.map(item=>`${item.id || 'Unidentified item'}: ${item.reason}`));
  return lines.join('\n');
}
