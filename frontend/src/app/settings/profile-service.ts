import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PlaceSuggestion, UserProfile } from './profile-types';

/** Loads and saves the profile, and suggests places for the location box. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>('/api/profile');
  }

  /** Saves the whole profile, the backend rejects a PLZ + place pair it doesn't know. */
  saveProfile(profile: UserProfile): Observable<UserProfile> {
    return this.http.put<UserProfile>('/api/profile', profile);
  }

  /** Suggestions for the location box, the backend rejects a query under 3 characters. */
  getPlaces(query: string): Observable<PlaceSuggestion[]> {
    return this.http.get<PlaceSuggestion[]>('/api/places', { params: { query } });
  }
}
