import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ProfileService } from './profile-service';
import { PlaceSuggestion, UserProfile } from './profile-types';

const PROFILE: UserProfile = {
  searchTerms: ['Software-Entwickler'],
  locationPlz: '50667',
  locationName: 'Köln',
  searchRadius: 30,
};

describe('ProfileService', () => {
  let service: ProfileService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProfileService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the profile', () => {
    let loaded: UserProfile | undefined;
    service.getProfile().subscribe((profile) => (loaded = profile));

    http.expectOne({ method: 'GET', url: '/api/profile' }).flush(PROFILE);

    expect(loaded).toEqual(PROFILE);
  });

  it('saves the whole profile with PUT', () => {
    let saved: UserProfile | undefined;
    service.saveProfile(PROFILE).subscribe((profile) => (saved = profile));

    const request = http.expectOne({ method: 'PUT', url: '/api/profile' });
    expect(request.request.body).toEqual(PROFILE);
    request.flush(PROFILE);

    expect(saved).toEqual(PROFILE);
  });

  it('asks for places with the query parameter', () => {
    const places: PlaceSuggestion[] = [
      { plz: '50667', name: 'Köln', district: null, isPlaceOnly: true },
    ];
    let suggested: PlaceSuggestion[] | undefined;
    service.getPlaces('Köl').subscribe((result) => (suggested = result));

    const request = http.expectOne((req) => req.url === '/api/places');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('query')).toBe('Köl');
    request.flush(places);

    expect(suggested).toEqual(places);
  });
});
