import { HttpInterceptorFn } from '@angular/common/http';

export const jobRadarHeaderInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Job-Radar': '1' } }));
