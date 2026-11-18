# places.csv

Contains information from [OpenStreetMap](https://www.openstreetmap.org/copyright), which is made available here under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). © OpenStreetMap contributors.

`places.csv` is a Derived Database under the ODbL 1.0. The license text is in [LICENSE-ODbL.md](LICENSE-ODbL.md), next to this file. Keep this notice and the license text with the file wherever it is copied or shipped (ODbL 4.2).

## Where it comes from

- **Streets and PLZ:** `streets.updated.csv` of [OpenPLZ API Data](https://github.com/openpotato/openplzapi.data) at commit `c26389b30573ab2738d0b14fd350f143aa0a1251` (2025-11-22), also ODbL 1.0. It is an extract of the OpenStreetMap file for Germany from Geofabrik, in which streets are matched to PLZ areas and municipalities.
- **Landkreis names:** the [OpenPLZ API](https://www.openplzapi.org/).

## What was changed

Each street became part of one row per PLZ + municipality pair: `plz`, `name` (the municipality), `district` (its Landkreis or kreisfreie Stadt, with the type prefixed where the name doesn't already say it) and `streetCount` (the number of streets in the pair). The street names and the regional keys are not in the file. Built by `spikes/places_table/build_places.py`, run it again to update the file.

## Use in the app

- The file is read as a separate resource and not merged into code or other data, so the app is a Collective Database around it and its own license is not affected (ODbL 4.5 a).
- Everything the app shows from the file is a Produced Work (ODbL 4.3). The settings view therefore shows the notice above, with the links.
