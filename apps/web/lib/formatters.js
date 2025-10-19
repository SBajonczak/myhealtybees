export function todayISO(date = new Date()) {
  return date.toISOString().split('T')[0];
}

export function canRecordWeight(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const month = date.getUTCMonth() + 1;
  return month >= 9;
}

export function activityDetails(type, payload) {
  switch (type) {
    case 'control':
      return {
        typeLabel: 'Kontrolle',
        details: [
          ['Königin vorhanden', payload.queenPresent ? 'Ja' : 'Nein'],
          ['Waben', payload.frameCount],
          ['Brutwaben', payload.broodFrameCount],
          ['Gewicht', payload.weightKg ? `${payload.weightKg} kg` : '–']
        ]
      };
    case 'feeding':
      return {
        typeLabel: 'Fütterung',
        details: [['Gefüttert', `${payload.kilograms} kg`]]
      };
    case 'treatment':
      return {
        typeLabel: 'Behandlung',
        details: [
          ['Art', payload.treatmentType === 'ameisensaeure' ? 'Ameisensäure' : 'Oxalsäure'],
          ['Nächster Termin', payload.nextTreatmentDate || 'Nicht geplant']
        ]
      };
    case 'treatment-followup':
      return {
        typeLabel: 'Nachkontrolle',
        details: [
          ['Nächste Kontrolle', payload.nextControlDate || 'Nicht geplant'],
          ['Nächste Behandlung', payload.nextTreatmentDate || 'Nicht geplant'],
          ['Milbenbefall', payload.miteInfestationLevel]
        ]
      };
    default:
      return { typeLabel: type, details: [] };
  }
}
