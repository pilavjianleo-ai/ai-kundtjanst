const Joi = require("joi");

function validate({ body, query, params } = {}) {
  return (req, res, next) => {
    try {
      if (body) {
        const r = body.validate(req.body, { abortEarly: true, stripUnknown: true });
        if (r.error) return res.status(400).json({ error: r.error.message });
        req.body = r.value;
      }
      if (query) {
        const r = query.validate(req.query, { abortEarly: true, stripUnknown: true });
        if (r.error) return res.status(400).json({ error: r.error.message });
        req.query = r.value;
      }
      if (params) {
        const r = params.validate(req.params, { abortEarly: true, stripUnknown: true });
        if (r.error) return res.status(400).json({ error: r.error.message });
        req.params = r.value;
      }
      next();
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  };
}

module.exports = { validate, Joi };
