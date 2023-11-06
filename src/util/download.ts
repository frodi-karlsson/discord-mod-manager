import { get } from "https";
import { writeFileSync } from "fs";

export async function download(url: string, target: string) {
  console.log(`Downloading ${url}...`);
  const promise = new Promise<void>((resolve, reject) => {
    get(url, (response) => {
      const statusCode = response.statusCode;
      if (!statusCode) {
        reject(new Error(`Could not find status code for ${url}`));
        return;
      }
      if ([301, 302].includes(statusCode)) {
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Could not find location header for ${url}`));
          return;
        }
        return download(location, target).then(resolve).catch(reject);
      } else if (statusCode !== 200) {
        return reject(new Error(`Could not download ${url}: ${statusCode}`));
      }
      const data: Buffer[] = [];
      response.on("data", (chunk) => {
        data.push(chunk);
      });
      response.on("end", () => {
        const buffer = Buffer.concat(data);
        writeFileSync(target, buffer);
        resolve(void 0);
      });
    });
  });
  return promise;
}
