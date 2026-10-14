import { connect } from 'mqtt';

export interface UpstreamOptions {
  username: string;
  /** The OAuth2 access token: OpenF1's MQTT broker takes it as the password. */
  token: string;
  topics: string[];
  onOpen: () => void;
  onMessage: (topic: string, payload: string) => void;
  /** Called when the connection ends or fails; `reason` is set on errors. */
  onClose: (reason?: string) => void;
}

export interface Upstream {
  close(): void;
}

/** Opens a connection to the live feed. Injectable so the relay can be tested without a network. */
export type UpstreamConnector = (options: UpstreamOptions) => Upstream;

const BROKER_URL = 'mqtts://mqtt.openf1.org:8883';

/** The real connector: OpenF1's MQTT broker over TLS. */
export const connectMqtt: UpstreamConnector = (options) => {
  // The relay does its own reconnecting (it needs a fresh token each time).
  const client = connect(BROKER_URL, {
    username: options.username,
    password: options.token,
    reconnectPeriod: 0,
    clean: true,
  });

  client.on('connect', () => {
    client.subscribe(options.topics, (error) => {
      if (error) options.onClose(`subscribe failed: ${error.message}`);
      else options.onOpen();
    });
  });
  client.on('message', (topic, payload) => options.onMessage(topic, payload.toString()));
  client.on('error', (error) => options.onClose(error.message));
  client.on('close', () => options.onClose());

  return { close: () => client.end(true) };
};
