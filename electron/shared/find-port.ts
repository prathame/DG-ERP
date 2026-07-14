import net from 'net';

/** Find a free TCP port starting from `start`. Tries up to 20 ports. */
export function findFreePort(start = 3001): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = start;
    const tryPort = () => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          port++;
          if (port > start + 20) {
            reject(new Error(`No free port found between ${start} and ${start + 20}`));
          } else {
            tryPort();
          }
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };
    tryPort();
  });
}
