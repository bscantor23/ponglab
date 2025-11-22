export class Player {
  public id: string;
  public name: string;
  public room: string;
  public isHost: boolean;
  public isActive: boolean;

  constructor(id: string, name: string, room: string) {
    this.id = id;
    this.name = name;
    this.room = room;
    this.isHost = false;
    this.isActive = true;
  }

  setHost(isHost: boolean): void {
    this.isHost = isHost;
  }

  setActive(active: boolean): void {
    this.isActive = active;
  }

  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      room: this.room,
      isHost: this.isHost,
      isActive: this.isActive
    };
  }
}