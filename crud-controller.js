// Import
const db = require("../models");
const _ = require("lodash");

// Table File
const filename = db.filename;

// Common Function
const Op = db.Sequelize.Op;
const returnError = require("../common/error");
const returnSuccess = require("../common/success");
const returnSuccessMessage = require("../common/successMessage");
const common = require("../common/common");

// Input Validation
const validatefilenameInput = require("../validation/filename-validation");

exports.list = async (req, res) => {
  //1. Record Fetching Setting
  let limit = 10;
  if (req.query.limit) limit = req.query.limit;

  let from = 0;
  if (!req.query.page) from = 0;
  else from = parseInt(req.query.page) * parseInt(limit);

  //2. Sort and Filter (If Any)
  let option = {};

  req.query.primaryKey = req.query.primaryKey ? req.query.primaryKey : "";
  req.query.description = req.query.description ? req.query.description : "";

  if (req.query.type && !_.isEmpty(req.query.type)) {
    option.type1 = req.query.type;
  }

  if (req.query.type2 && !_.isEmpty(req.query.type2)) {
    option.type2 = req.query.type2;
  }

  if (req.query.search && !_.isEmpty(req.query.search)) {
    option = {
      [Op.or]: [
        { primaryKey: { [Op.eq]: req.query.search } },
        { primaryKey: { [Op.like]: "%" + req.query.search + "%" } },
        { description: { [Op.eq]: req.query.search } },
        { description: { [Op.like]: "%" + req.query.search + "%" } },
      ],
    };
  }

  //3. Start Fetching
  const { count, rows } = await filename.findAndCountAll({
    limit: parseInt(limit),
    offset: from,
    where: option,
    raw: true,
    attributes: [
      ["primaryKey", "id"],
      "primaryKey",
      "description",
      "localDescription",
      "type1",
      "type2",
      "type3",
      "type4",
      "type5",
      "type6",
    ],
    order: [["id", "asc"]],
  });

  //4. Apply the types description (For example A - Active, E - Expired...) && Apply Format
  let newRows = [];
  for (var i = 0; i < rows.length; i++) {
    let obj = rows[i];

    if (!_.isEmpty(obj.type1)) {
      let description = await common.retrieveSpecificGenCodes(
        req,
        "CODE1",
        obj.type1
      );
      obj.type1dsc =
        description.prgedesc && !_.isEmpty(description.prgedesc)
          ? description.prgedesc
          : "";
    }
    if (!_.isEmpty(obj.type5)) {
      let description = await common.retrieveSpecificGenCodes(
        req,
        "YESORNO",
        obj.type5
      );
      obj.type5dsc =
        description.prgedesc && !_.isEmpty(description.prgedesc)
          ? description.prgedesc
          : "";
    }
    newRows.push(obj);
  }

  // 5. Return Result
  if (count > 0)
    return returnSuccess(
      200,
      {
        total: count,
        data: newRows,
        extra: { file: "filename", key: ["primaryKey"] },
      },
      res
    );
  else return returnSuccess(200, { total: 0, data: [] }, res);
};

exports.findOne = async (req, res) => {
  // 1. Validate Id 
  const id = req.query.id ? req.query.id : "";
  if (id == "") return returnError(req, 500, "RECORDIDISREQUIRED", res);
  // 2. Fetch Date 
  filename
    .findOne({ where: { primaryKey: id }, raw: true })
    .then(async (obj) => {
      if (obj) {

        // 3. Formatting
        if (!_.isEmpty(obj.type1)) {
          let description = await common.retrieveSpecificGenCodes(
            req,
            "CODE1",
            obj.type1
          );
          obj.type1dsc =
            description.prgedesc && !_.isEmpty(description.prgedesc)
              ? description.prgedesc
              : "";
        }
        if (!_.isEmpty(obj.type5)) {
          let description = await common.retrieveSpecificGenCodes(
            req,
            "YESORNO",
            obj.type5
          );
          obj.type5dsc =
            description.prgedesc && !_.isEmpty(description.prgedesc)
              ? description.prgedesc
              : "";
        }

        // 4. Return Result
        return returnSuccess(200, obj, res);
      } else return returnError(req, 500, "NORECORDFOUND", res);
    })
    .catch((err) => {
      console.log(err);
      return returnError(req, 500, "UNEXPECTEDERROR", res);
    });
};

exports.create = async (req, res) => {
  //1. Validation
  const { errors, isValid } = validatefilenameInput(req.body, "A");
  if (!isValid) return returnError(req, 400, errors, res);

  // 2. Generate Code(uuiv, running code), if any:
  let code = await common.getNextRunning("TRN");
  let initial = "TRN-"
  let reference = initial;
  reference += _.padStart(code, 6, '0');

  //3. Duplicate Check
  filename
    .findOne({
      where: {
        primaryKey: req.body.primaryKey,
      },
      raw: true,
    })
    .then(async (trnscd) => {
      if (trnscd)
        return returnError(req, 400, { primaryKey: "RECORDEXISTS" }, res);
      else {
        //4. Code Checking
        let ddlErrors = {};
        let err_ind = false;
        let CODE1 = await common.retrieveSpecificGenCodes(
          req,
          "CODE1",
          req.body.type1
        );
        if (!CODE1 || !CODE1.prgedesc) {
          ddlErrors.type1 = "INVALIDDATAVALUE";
          err_ind = true;
        }
        if (!_.isEmpty(req.body.type5)) {
          let yesorno = await common.retrieveSpecificGenCodes(
            req,
            "YESORNO",
            req.body.type5
          );
          if (!yesorno || !yesorno.prgedesc) {
            ddlErrors.type5 = "INVALIDDATAVALUE";
            err_ind = true;
          }
        }
        if (err_ind) return returnError(req, 400, ddlErrors, res);
        else {

          //5. Creation of record
          filename
            .create({
              primaryKey: req.body.primaryKey,
              description: req.body.description,
              localDescription: req.body.localDescription,
              type1: req.body.type1,
              type2: req.body.type2,
              type3: req.body.type3,
              type4: req.body.type4,
              type5: req.body.type5,
              type6: req.body.type6,
              crtuser: req.user.psusrunm,
              mntuser: req.user.psusrunm,
            })
            .then(async (data) => {
              let created = data.get({ plain: true });

              // 6. Logging 
              common.writeMntLog(
                "filename",
                null,
                null,
                created.primaryKey,
                "A",
                req.user.psusrunm,
                "", created.primaryKey);

              //7. Return Success
              return returnSuccessMessage(req, 200, "RECORDCREATED", res);
            })
            .catch((err) => {
              console.log(err);
              return returnError(req, 500, "UNEXPECTEDERROR", res);
            });
        }
      }
    })
    .catch((err) => {
      console.log(err);
      return returnError(req, 500, "UNEXPECTEDERROR", res);
    });
};

exports.update = async (req, res) => {
  // 1. Get To-be-updated Primary Key (Known as ID)
  const id = req.body.id ? req.body.id : "";
  if (id == "") return returnError(req, 500, "RECORDIDISREQUIRED", res);

  //2. Validation Checking
  const { errors, isValid } = validatefilenameInput(req.body, "C");
  if (!isValid) return returnError(req, 400, errors, res);

  //3. Fetch Record
  await filename
    .findOne({
      where: {
        primaryKey: id,
      },
      raw: true,
      attributes: {
        exclude: ["createdAt", "crtuser", "mntuser"],
      },
    })
    .then(async (data) => {
      if (data) {
        // 4. Check IF date is updated
        if (isNaN(new Date(req.body.updatedAt)) || (new Date(data.updatedAt).getTime() !== new Date(req.body.updatedAt).getTime()))
          return returnError(req, 500, "RECORDOUTOFSYNC", res)

        // 5. Check Formatting / Code
        let ddlErrors = {};
        let err_ind = false;
        let CODE1 = await common.retrieveSpecificGenCodes(
          req,
          "CODE1",
          req.body.type1
        );
        if (!CODE1 || !CODE1.prgedesc) {
          ddlErrors.type1 = "INVALIDDATAVALUE";
          err_ind = true;
        }
        if (!_.isEmpty(req.body.type5)) {
          let yesorno = await common.retrieveSpecificGenCodes(
            req,
            "YESORNO",
            req.body.type5
          );
          if (!yesorno || !yesorno.prgedesc) {
            ddlErrors.type5 = "INVALIDDATAVALUE";
            err_ind = true;
          }
        }

        if (err_ind) return returnError(req, 400, ddlErrors, res);

        //6. Start Update
        filename
          .update(
            {
              description: req.body.description,
              localDescription: req.body.localDescription,
              type1: req.body.type1,
              type2: req.body.type2,
              type3: req.body.type3,
              type4: req.body.type4,
              type5: req.body.type5,
              type6: req.body.type6,

              mntuser: req.user.psusrunm,
            },
            {
              where: {
                id: data.id,
              },
            }
          )
          .then(async () => {

            //7. Logging
            common.writeMntLog(
              "filename",
              data,
              await filename.findByPk(data.id, { raw: true }),
              data.primaryKey,
              "C",
              req.user.psusrunm
            );

            //8. Return Result
            return returnSuccessMessage(req, 200, "RECORDUPDATED", res);
          });
      } else return returnError(req, 500, "NORECORDFOUND", res);
    })
    .catch((err) => {
      return returnError(req, 500, "UNEXPECTEDERROR", res);
    });
};

exports.delete = async (req, res) => {
  //1. Get to-be-deleted Primary Key(Known as id)
  const id = req.body.id ? req.body.id : "";
  if (id == "") return returnError(req, 500, "RECORDIDISREQUIRED", res);

  //2. fetch record
  await filename
    .findOne({
      where: {
        primaryKey: id,
      },
      raw: true,
    })
    .then((trnscd) => {
      if (trnscd) {
        //3. Start to delete
        filename
          .destroy({
            where: { id: trnscd.id },
          })
          .then(() => {
            //4. Logging
            common.writeMntLog(
              "filename",
              null,
              null,
              trnscd.primaryKey,
              "D",
              req.user.psusrunm,
              "",
              trnscd.primaryKey
            );

            //5. Return result
            return returnSuccessMessage(req, 200, "RECORDDELETED", res);
          })
          .catch((err) => {
            console.log(err);
            return returnError(req, 500, "UNEXPECTEDERROR", res);
          });
      } else return returnError(req, 500, "NORECORDFOUND", res);
    })
    .catch((err) => {
      console.log(err);
      return returnError(req, 500, "UNEXPECTEDERROR", res);
    });
};
