/** The profile of `GET` and `PUT /api/profile`, the milestone 1 fields only. */
export interface UserProfile {
  /** At most one entry for now, empty while no term is set. */
  searchTerms: string[];
  /** Set together with `locationName`, both null while no place is picked. */
  locationPlz: string | null;
  locationName: string | null;
  /** 1 to 100 km, null until the user sets it. */
  searchRadius: number | null;
}

/** A suggestion of `GET /api/places`, a bare place with its representative PLZ or a PLZ + place pair. */
export interface PlaceSuggestion {
  plz: string;
  name: string;
  /** The Landkreis, only set when the place name occurs in several. */
  district: string | null;
  isPlaceOnly: boolean;
}

/** The place of the profile, a PLZ + place pair from the places table. */
export interface ProfilePlace {
  plz: string;
  name: string;
}
