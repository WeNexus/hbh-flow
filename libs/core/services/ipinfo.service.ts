import { Injectable } from '@nestjs/common';
import { IPinfoWrapper } from 'node-ipinfo';

@Injectable()
export class IPInfoService extends IPinfoWrapper {}
