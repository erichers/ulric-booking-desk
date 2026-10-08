import { Routes } from '@angular/router';
import { BookingPage } from './pages/booking';
import { Bookings } from './pages/bookings';
import { DeskHome } from './pages/dashboard';
import { Guest } from './pages/guest';
import { Home } from './pages/home';
import { Outbox } from './pages/outbox';
import { Requests } from './pages/requests';
import { Settings } from './pages/settings';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'stay/:token', component: Guest },
  { path: 'host', component: DeskHome },
  { path: 'host/requests', component: Requests },
  { path: 'host/bookings', component: Bookings },
  { path: 'host/bookings/:id', component: BookingPage },
  { path: 'host/outbox', component: Outbox },
  { path: 'host/settings', component: Settings },
  { path: '**', redirectTo: '' },
];
