# sha1

```ts
import { newSha1 } from "./sha1.js"

```

```ts
 const encoder = new TextEncoder();
 const token1 = encoder.encode("Hello");
 const token2 = encoder.encode(" ");
 const token3 = encoder.encode("World");

 view(newSha1()
  .update(token1)
  // .update(token2)
  // .update(token3)
  .hex()
 );


 view(newSha1()
  .update(token1)
  .update(token2)
  // .update(token3)
  .hex()
 );
 view(newSha1()
  .update(token1)
  // .update(token2)
  .update(token3)
  .hex()
 );

 view(newSha1()
  .update(token1)
  .update(token2)
  .update(token3)
  .hex()
 );
 ```