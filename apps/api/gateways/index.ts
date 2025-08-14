import { ConnectionGateway } from '#app/api/gateways/connection.gateway';
import { ActivityGateway } from './activity.gateway';
import { DefaultGateway } from './default.gateway';

export const gateways = [ActivityGateway, DefaultGateway, ConnectionGateway];
