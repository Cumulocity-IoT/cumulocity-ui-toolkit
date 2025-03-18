import { inject, Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from '@angular/router';
import { IManagedObject, IResult } from '@c8y/client';
import { Observable } from 'rxjs';
import { SimulatorsServiceService } from './simulators-service.service';

@Injectable()
export class TemplateResolverService implements Resolve<IResult<IManagedObject>> {
  private service = inject(SimulatorsServiceService);

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ):
    | Observable<IResult<IManagedObject>>
    | Promise<IResult<IManagedObject>>
    | IResult<IManagedObject> {
    return this.service.getTemplateById(route.paramMap.get('id'));
  }
}
