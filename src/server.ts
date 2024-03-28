import fastify from "fastify";
import { z } from 'zod'
import { sql } from "./lib/postgres";
import postgres from "postgres";
import { redis } from "./lib/redis";


const app = fastify()


app.get('/:code', async (request, reply) => {
    const getLinkSchema = z.object({
        code: z.string().min(3)
    })

    const { code } = getLinkSchema.parse(request.params)

    const result = await sql /*sql*/`
        SELECT id, original_url
        FROM encurt_url
        WHERE encurt_url.code = ${code}
    `

    if (result.length == 0) {
        return reply.status(400).send({ message: 'Link not found.'})
    }
    
    const link = result[0]

    await redis.zIncrBy('metrics', 1, String(link.id)) 

    return reply.redirect(301, link.original_url)
})

app.get('/api/links', async () => {
    const result = await sql /*sql*/`
    SELECT *
    FROM encurt_url
    ORDER BY created_at DESC
    `

    return result
})

app.post('/api/links', async (request, reply) => {
    const createLinksSchema = z.object({
        code: z.string().min(3),
        url: z.string().url(),
    })

    const { code, url } = createLinksSchema.parse(request.body)

// retornará o ID que foi assumido pelo code

    try {
    const result = await sql/*sq*/`
      INSERT INTO encurt_url (code, original_url)
      VALUES (${code}, ${url})
      RETURNING id
    `

    const link = result[0]

    //200 - generico 201 - criado com sucesso

    return reply.status(201).send({ encurtUrlId: link.id })
    } catch (err) {
        if (err instanceof postgres.PostgresError){
            if (err.code == '23505') {
                return reply.status(400).send({ message: 'Duplicate code!'})
            }
        }
        console.error(err)

        return reply.status(500).send({ message: 'Internal error.'})
    }
})

app.get('/api/metrics', async () => {
    const result = await redis.zRangeByScoreWithScores('metrics', 0, 50)

    const metrics = result
    .sort((a, b) => b.score - a.score)
    .map(item => {
        return {
            encurtUrlId: Number(item.value),
            clicks: item.score,
        }
    })

    return metrics 
})  




app.listen({
    port: 1211,
}).then(() => {
    console.log("HTTP server runing")
})