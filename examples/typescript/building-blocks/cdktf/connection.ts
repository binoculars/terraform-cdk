import {
  // Aspects,
  // IAspect,
  TerraformModule,
  TerraformResource,
  // TerraformStack,
} from "cdktf";
import { Construct, IConstruct } from "constructs";

type Constructor<T> = new (...args: any[]) => T;

// export class CdktfAutoConnect implements IAspect {
//   private constructor(private scope: Construct) {}

//   public static init(scope: Construct) {
//     Aspects.of(scope).add(new CdktfAutoConnect(scope));
//   }

//   visit(node: IConstruct): void {
//     if (!isConnectable(node)) {
//       return;
//     }
//     const nodeId = getTypeIdFromConstruct(node);
//     const connectionScope = ConnectionScope.of(node);
//     if (connectionScope) {
//       const pinnedConstruct = connectionScope.pinnedInstances[nodeId];
//       const [socketType, connectionFn] =
//         connectionScope.connections[getTypeIdFromConstruct(node)];
//       const a = node;
//       const b = pinnedConstruct || this.find(socketType);

//       connectionFn(a, b as Connectable);
//     } else {
//       const [socketType, connectionFn] =
//         connections[getTypeIdFromConstruct(node)];
//       const a = node;
//       const b = this.find(socketType);

//       if (b) {
//         connectionFn(a, b);
//       }
//     }
//   }

//   private find(connectableId: ConnectableTypeId): Connectable | undefined {
//     return TerraformStack.of(this.scope)
//       .node.findAll()
//       .find(
//         (c) => isConnectable(c) && getTypeIdFromConstruct(c) === connectableId
//       ) as TerraformModule | undefined;
//   }
// }

export function connect(a: Connectable, b: Connectable) {
  const possibleConnections = connections[getTypeIdFromConstruct(a)];
  if (!possibleConnections) {
    throw new Error(`No connections for ${getTypeIdFromConstruct(a)}`);
  }
  const connection = possibleConnections.find(
    ([id]) => id === getTypeIdFromConstruct(b)
  );
  if (!connection) {
    throw new Error(
      `No connection from ${getTypeIdFromConstruct(
        a
      )} to ${getTypeIdFromConstruct(b)}`
    );
  }

  connection[1](a, b);
}

type ConnectableTypeId =
  | TerraformModule["source"]
  | TerraformResource["terraformResourceType"];
export type Connectable = (
  | { source: string }
  | { terraformResourceType: string }
  | { type: string }
) &
  Construct;

export abstract class ConnectableConstruct extends Construct {
  public abstract type: string;
}

// function isConnectable(x: Construct): x is Connectable {
//   return "source" in x || "terraformResourceType" in x;
// }

type ConnectFn<F extends Connectable, T extends Connectable> = (
  a: F,
  b: T
) => void;

type ConnectionRecord = Record<
  ConnectableTypeId,
  [ConnectableTypeId, ConnectFn<Connectable, Connectable>][]
>;
const connections: ConnectionRecord = {};

export function registerConnection<
  F extends Connectable,
  T extends Connectable
>(from: Constructor<F>, to: Constructor<T>, connect: ConnectFn<F, T>) {
  connections[getTypeId(from)] = connections[getTypeId(from)] || [];
  if (connections[getTypeId(from)].some(([id]) => id === getTypeId(to))) {
    throw new Error(
      `Connection from ${from} to ${to} already registered: ${connections[
        getTypeId(from)
      ].filter(([id]) => id === getTypeId(to))}`
    );
  }
  connections[getTypeId(from)].push([getTypeId(to), connect as any]);
}

function getTypeIdFromConstruct(o: Connectable): ConnectableTypeId {
  if ("source" in o) {
    return o.source;
  } else if ("terraformResourceType" in o) {
    return o.terraformResourceType;
  } else if ("type" in o) {
    return o.type;
  }

  throw new Error(
    `Invalid Connectable ${o}. Neither source nor terraformResourceType present`
  );
}

function getTypeId(c: Constructor<Connectable>): ConnectableTypeId {
  return (c as any).tfResourceType || (c as any).type; // We need sth similar on modules and custom constructs?
}

// TODO: Add in a scoping mechanism to allow different connection implementations
// Think about a composable way of doing conenctions maybe?
const CONNECTION_SCOPE_SYMBOL = Symbol.for("cdktf/ConnectionScope");
export class ConnectionScope extends Construct {
  public connections: ConnectionRecord = {};
  public pinnedInstances: Record<ConnectableTypeId, Construct> = {};

  constructor(scope: Construct, name: string) {
    super(scope, name);

    Object.defineProperty(this, CONNECTION_SCOPE_SYMBOL, { value: true });
  }

  public static isConnectionScope(x: any): x is ConnectionScope {
    return x !== null && typeof x === "object" && CONNECTION_SCOPE_SYMBOL in x;
  }
  public static of(construct: IConstruct): ConnectionScope | undefined {
    return _lookup(construct);

    function _lookup(c: IConstruct): ConnectionScope | undefined {
      if (ConnectionScope.isConnectionScope(c)) {
        return c;
      }

      const node = c.node;

      if (!node.scope) {
        return undefined;
      }

      return _lookup(node.scope);
    }
  }

  // TODO: maybe refactor to standalone function?
  public registerConnection<F extends Connectable, T extends Connectable>(
    from: Constructor<F>,
    to: Constructor<T>,
    connect: ConnectFn<F, T>
  ) {
    this.connections[getTypeId(from)] = [getTypeId(to), connect as any];
  }
}

export function pinForConnection(c: Connectable) {
  const id = getTypeIdFromConstruct(c);
  const scope = c.node.scope!;
  const connectionScope = ConnectionScope.of(scope);

  if (!connectionScope) {
    throw new Error("Could not find a connection scope");
  }

  connectionScope.pinnedInstances[id] = c;
}
