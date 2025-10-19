# API Nutzung

Die digitale Stockkarten-API besteht ausschließlich aus JSON-Endpunkten. Sämtliche
Anfragen (außer der Anmeldung) erfordern ein gültiges Bearer-Token im Header
`Authorization`.

```
Authorization: Bearer <token>
Content-Type: application/json
```

## Anmeldung

`POST /api/auth/login`

```json
{
  "provider": "google",
  "externalId": "anbieterspezifische-id",
  "name": "Imker Max",
  "email": "max@example.com"
}
```

- Unterstützte Anbieter: `google`, `facebook`, `microsoft`
- Antwort: `token` (JWT kompatibel) sowie ein reduzierter Nutzer-Datensatz

> **Hinweis:** Die eigentliche OAuth-Authentifizierung findet außerhalb der API
> statt (z. B. via OAuth Redirect). Der Client sendet anschließend Provider und
> externe ID an diesen Endpunkt.

## Völker (Hives)

### Völker auflisten

`GET /api/hives`

Antwort:

```json
{
  "hives": [
    {
      "id": "...",
      "race": "Carnica",
      "queenDate": "2024-05-01",
      "location": "Obstwiese",
      "hiveFormat": "Zander",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### Volk anlegen

`POST /api/hives`

```json
{
  "id": "optional-client-id",
  "race": "Buckfast",
  "queenDate": "2024-04-17",
  "location": "Standort A",
  "hiveFormat": "Dadant"
}
```

Antwort enthält das erzeugte Volk. Ähnliche Struktur gilt für `PUT /api/hives/:id`
(Aktualisierung) und `DELETE /api/hives/:id` (Löschen). Über `GET /api/hives/:id`
erhält man ein einzelnes Volk mit allen gespeicherten Feldern.

## Aktivitäten

Aktivitäten werden einem Volk zugeordnet. Jeder Eintrag erhält automatisch ein
ISO-Datum `date` sowie einen Zeitstempel.

### Aktivitäten abrufen

`GET /api/hives/:id/activities`

Antwort:

```json
{
  "activities": [
    {
      "id": "...",
      "type": "control",
      "date": "2024-09-15",
      "queenPresent": true,
      "frameCount": 10,
      "broodFrameCount": 8,
      "weightKg": 32,
      "comment": "Sehr vital"
    }
  ]
}
```

### Neue Aktivität anlegen

`GET /api/hives/:id/activities/:activityId` liefert einen einzelnen Eintrag.

### Neue Aktivität anlegen

`POST /api/hives/:id/activities`

```json
{
  "type": "control",
  "payload": {
    "id": "optional-activity-id",
    "date": "2024-09-15",
    "queenPresent": true,
    "frameCount": 10,
    "broodFrameCount": 8,
    "weightKg": 32,
    "comment": "Vital"
  }
}
```

Zulässige Typen und Felder:

- `control`: `queenPresent` (bool), `frameCount`, `broodFrameCount`, optional
  `weightKg` (nur für Herbstmonate), `comment`
- `feeding`: `kilograms` (kg), optional `comment`
- `treatment`: `treatmentType` (`ameisensaeure` | `oxalsaeure`), optional
  `nextTreatmentDate`, `comment`
- `treatment-followup`: `nextControlDate`, `nextTreatmentDate`,
  `miteInfestationLevel` (`niedrig` | `mittel` | `hoch`), optional `comment`

Alle Datumsfelder akzeptieren ISO-8601 (`YYYY-MM-DD`) und dürfen nicht in der
Zukunft liegen.

### Aktivität aktualisieren oder löschen

- `PUT /api/hives/:id/activities/:activityId`

  ```json
  {
    "payload": {
      "date": "2024-10-01",
      "queenPresent": true,
      "frameCount": 9,
      "broodFrameCount": 7,
      "comment": "Kontrolle nach Tracht"
    }
  }
  ```

- `DELETE /api/hives/:id/activities/:activityId`

  Entfernt den Eintrag dauerhaft.

## Synchronisation für Offline-Nutzung

`GET /api/sync`
: Liefert vollständige Völker- und Aktivitätsdaten für den angemeldeten Nutzer.

`POST /api/sync`
: Nimmt mehrere Operationen entgegen, z. B. aus einer Offline-Warteschlange.

Beispiel:

```json
{
  "operations": [
    {
      "type": "create-hive",
      "payload": {
        "id": "offline-hive-1",
        "race": "Carnica",
        "queenDate": "2023-04-15",
        "location": "Stand 2",
        "hiveFormat": "Dadant"
      }
    },
    {
      "type": "create-activity",
      "hiveId": "offline-hive-1",
      "activityType": "feeding",
      "payload": {
        "id": "offline-activity-1",
        "date": "2024-08-20",
        "kilograms": 5
      }
    },
    {
      "type": "update-activity",
      "hiveId": "offline-hive-1",
      "activityId": "offline-activity-1",
      "payload": {
        "date": "2024-08-25",
        "kilograms": 6,
        "comment": "Nachschub"
      }
    },
    {
      "type": "delete-activity",
      "hiveId": "offline-hive-1",
      "activityId": "offline-activity-1"
    }
  ]
}
```

Antwort:

```json
{
  "applied": 4,
  "hives": [...],
  "activities": [...]
}
```

Fehlerhafte Operationen werden übersprungen, damit der Rest trotzdem
synchronisiert werden kann. Die Client-App sollte anschließend die gelieferten
Daten als neue Wahrheit speichern.

## HTTP-Statuscodes

- `200 OK`: Anfrage erfolgreich
- `201 Created`: Ressource wurde erzeugt
- `400 Bad Request`: Daten konnten nicht validiert werden
- `401 Unauthorized`: Authentifizierung fehlend oder ungültig
- `404 Not Found`: Ressource existiert nicht
- `500 Internal Server Error`: Unerwarteter Fehler

## Sicherheit

- Tokens laufen nach 30 Tagen ab.
- Alle Eingaben werden validiert, sensible Zeichen werden im Frontend
  neutralisiert.
- Es werden nur die minimal benötigten personenbezogenen Daten gespeichert.
