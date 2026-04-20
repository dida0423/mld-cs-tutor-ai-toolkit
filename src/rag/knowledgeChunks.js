/**
 * RAG knowledge base: distilled notes with explicit source citations.
 * Each chunk is embedded once per session; retrieval is by cosine similarity.
 *
 * `topics`: 'MapReduce' | 'Embeddings' | 'Gradient Descent' | '*' (all tabs).
 *
 * Primary references processed for this file:
 * - MapReduce: https://hadoop.apache.org/docs/r1.2.1/mapred_tutorial.html
 * - MapReduce: https://www.geeksforgeeks.org/big-data/map-reduce-in-hadoop/
 * - Embeddings: https://www.geeksforgeeks.org/machine-learning/what-are-embeddings-in-machine-learning/
 * - Embeddings API: https://developers.openai.com/api/docs/guides/embeddings
 * - Gradient descent: https://ml-cheatsheet.readthedocs.io/en/latest/gradient_descent.html
 */

export const RAG_CHUNKS = [
  {
    id: 'lab-overview',
    topics: ['*'],
    title: 'Using this lab with retrieved sources',
    text: `This app’s **live JSON state** (sliders, step, vectors, loss) is authoritative for what you see. Retrieved notes summarize external references—use them for definitions and intuition, not for exact numbers in the demo.

**How to cite in answers:** mention the source name or URL when a fact comes from retrieved notes.`,
  },

  /* —— MapReduce: Apache Hadoop tutorial —— */
  {
    id: 'mr-apache-overview',
    topics: ['MapReduce'],
    title: 'Apache: Hadoop MapReduce overview',
    text: `**Hadoop MapReduce** is a framework for applications that process very large data sets **in parallel** on clusters of commodity hardware in a **fault-tolerant** way. A job **splits** the input into independent chunks processed by **map tasks** in parallel; the framework **sorts** map outputs, which become input to **reduce tasks**. Scheduling, monitoring, and **re-execution of failed tasks** are handled by the framework. Often **compute and storage** nodes coincide (MapReduce + **HDFS**), so tasks can run **where data already lives**, improving bandwidth.

Sources: [Apache MapReduce Tutorial](https://hadoop.apache.org/docs/r1.2.1/mapred_tutorial.html) (Overview).`,
  },
  {
    id: 'mr-apache-keyvalue',
    topics: ['MapReduce'],
    title: 'Apache: MapReduce I/O as ⟨key, value⟩ pairs',
    text: `The framework operates on **⟨key, value⟩** pairs end-to-end: input is a set of pairs, output is pairs (possibly different types). Conceptually: **(input) ⟨k1,v1⟩ → map → ⟨k2,v2⟩ → combine → ⟨k2,v2⟩ → reduce → ⟨k3,v3⟩ (output)**. Keys must support **sorting** (e.g. WritableComparable in Hadoop’s Java API).

Sources: [Apache MapReduce Tutorial — Inputs and Outputs](https://hadoop.apache.org/docs/r1.2.1/mapred_tutorial.html#Inputs+and+Outputs).`,
  },
  {
    id: 'mr-apache-wordcount',
    topics: ['MapReduce'],
    title: 'Apache: WordCount walk-through (mapper, combiner, reducer)',
    text: `Classic **WordCount**: the **mapper** reads lines (e.g. TextInputFormat), tokenizes words, and emits **⟨word, 1⟩** for each token. A **combiner** can **locally aggregate** map output before shuffle (here often same logic as reducer). The **reducer** sums counts per key. Example merge of map outputs: multiple **⟨Hello, 1⟩** become one **⟨Hello, n⟩** after aggregation.

Sources: [Apache MapReduce Tutorial — Example: WordCount v1.0 / Walk-through](https://hadoop.apache.org/docs/r1.2.1/mapred_tutorial.html#Example%3A+WordCount+v1.0).`,
  },
  {
    id: 'mr-gfg-pipeline',
    topics: ['MapReduce'],
    title: 'GeeksforGeeks: Map phase, shuffle, reduce',
    text: `**Map phase:** data is broken into chunks; each chunk is processed and produces **intermediate ⟨key, value⟩** pairs (e.g. word counts emit **⟨word, 1⟩**). **Shuffle:** values that share a **key** are **grouped** (and sorted) so the reducer can consume them. **Reduce phase:** each group is **aggregated** to the final output (e.g. sum counts per word). On HDFS, files are split into **input splits**; formats like **TextInputFormat** turn lines into **(offset, line)** pairs for mappers.

Sources: [Map Reduce in Hadoop — GeeksforGeeks](https://www.geeksforgeeks.org/big-data/map-reduce-in-hadoop/).`,
  },
  {
    id: 'mr-gfg-advantages',
    topics: ['MapReduce'],
    title: 'GeeksforGeeks: why MapReduce matters',
    text: `Typical strengths attributed to MapReduce in Hadoop: **scalability** on large data, **parallelism** across nodes, **fault tolerance** (failed work can be retried/reassigned), and a **simple programming model** focused on map and reduce logic while the framework handles distribution.

Sources: [Map Reduce in Hadoop — GeeksforGeeks](https://www.geeksforgeeks.org/big-data/map-reduce-in-hadoop/).`,
  },

  /* —— Embeddings: GeeksforGeeks + OpenAI —— */
  {
    id: 'emb-gfg-definition',
    topics: ['Embeddings'],
    title: 'GeeksforGeeks: what embeddings are in ML',
    text: `**Embeddings** represent data as **numerical vectors** in a **continuous** space so that **similar items lie closer** and dissimilar ones farther apart. They turn categorical or complex inputs into **dense vectors** usable by models. Applications include **NLP**, **recommender systems**, and **computer vision**. Training often uses **metric learning** (similar vs dissimilar pairs) and may use **hard negatives** to sharpen boundaries.

Sources: [What are Embeddings in Machine Learning? — GeeksforGeeks](https://www.geeksforgeeks.org/machine-learning/what-are-embeddings-in-machine-learning/).`,
  },
  {
    id: 'emb-gfg-visualization',
    topics: ['Embeddings'],
    title: 'GeeksforGeeks: t-SNE and visualization caveats',
    text: `**t-SNE** (and similar 2D projections) help **visualize** high-dimensional embeddings. **Limitations:** global distances can be **distorted**; results depend on **parameters** (e.g. perplexity); can be **costly** on large data; mainly for **inspection**, not a substitute for similarity in the original embedding space.

Sources: [What are Embeddings in Machine Learning? — GeeksforGeeks](https://www.geeksforgeeks.org/machine-learning/what-are-embeddings-in-machine-learning/) (visualization section).`,
  },
  {
    id: 'emb-openai-relatedness',
    topics: ['Embeddings'],
    title: 'OpenAI: text embeddings and relatedness',
    text: `OpenAI **text embeddings** score **relatedness** between strings. Common uses: **search** (rank by relevance), **clustering**, **recommendations**, **anomaly detection**, **diversity** analysis, and **classification** (label by nearest neighbor). An embedding is a **vector of floats**; **distance** between two vectors indicates relatedness (small distance ⇒ more related). Typical default sizes: **1536** dimensions for \`text-embedding-3-small\`, **3072** for \`text-embedding-3-large\`, with **max input** context **8192** tokens for those models.

Sources: [Vector embeddings — OpenAI API docs](https://developers.openai.com/api/docs/guides/embeddings).`,
  },
  {
    id: 'emb-openai-dimensions-rag',
    topics: ['Embeddings'],
    title: 'OpenAI: dimensions parameter and retrieval',
    text: `Newer embedding models support a **\`dimensions\`** parameter to **shorten** vectors for storage/cost while retaining usefulness; manual truncation should be paired with **L2 normalization** when required. Embeddings power **semantic search** and **RAG**: retrieve relevant passages by vector similarity, then pass them into a chat model’s context.

Sources: [Vector embeddings — OpenAI API docs](https://developers.openai.com/api/docs/guides/embeddings) (dimensions, use cases).`,
  },

  /* —— Gradient descent: ML Cheatsheet —— */
  {
    id: 'gd-cheatsheet-intro',
    topics: ['Gradient Descent'],
    title: 'ML Cheatsheet: gradient descent goal',
    text: `**Gradient descent** minimizes a function by moving iteratively in the direction of **steepest descent**, defined by the **negative of the gradient**. In ML it updates **parameters** (e.g. regression coefficients or neural **weights**). From a high “cost” region, each step recomputes the gradient at the new position until reaching a **minimum** (local or, when lucky, global in simple cases).

Sources: [Gradient Descent — ML Cheatsheet](https://ml-cheatsheet.readthedocs.io/en/latest/gradient_descent.html).`,
  },
  {
    id: 'gd-cheatsheet-learning-rate',
    topics: ['Gradient Descent'],
    title: 'ML Cheatsheet: learning rate trade-offs',
    text: `The **learning rate** sets **step size**. A **high** learning rate covers more ground per step but risks **overshooting** minima because the slope changes. A **very low** learning rate is **safer** (follows negative gradient closely) but needs **many** steps—gradient computation can dominate wall-clock time.

Sources: [Gradient Descent — Learning rate — ML Cheatsheet](https://ml-cheatsheet.readthedocs.io/en/latest/gradient_descent.html#learning-rate).`,
  },
  {
    id: 'gd-cheatsheet-cost',
    topics: ['Gradient Descent'],
    title: 'ML Cheatsheet: cost function and updates',
    text: `A **cost (loss) function** measures how good the model is for given parameters; its **gradients** indicate how to adjust parameters to improve predictions. For multiple parameters, use **partial derivatives** collected into a **gradient vector**; updates subtract the gradient direction scaled by the learning rate (derivatives point toward **ascent**, so we subtract for **minimization**).

Sources: [Gradient Descent — ML Cheatsheet](https://ml-cheatsheet.readthedocs.io/en/latest/gradient_descent.html#cost-function).`,
  },
]
