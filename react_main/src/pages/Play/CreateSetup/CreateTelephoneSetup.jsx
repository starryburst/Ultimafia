import React, { useContext, useEffect } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";

import CreateBrowser from "./CreateBrowser";
import { SiteInfoContext } from "../../../Contexts";
import { useForm } from "../../../components/Form";
import { useErrorAlert } from "../../../components/Alerts";

export default function CreateTelephoneSetup() {
  const gameType = "Telephone";
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const errorAlert = useErrorAlert();
  const [formFields, updateFormFields, resetFormFields] = useForm([
    {
      label: "Setup Name",
      ref: "name",
      type: "text",
    },
  ]);

  const siteInfo = useContext(SiteInfoContext);

  useEffect(() => {
    document.title = "Create Telephone Setup | UltiMafia";
  }, []);

  function onCreateSetup(roleData, editing, setRedirect, gameSettings) {
    const setupName = formFields[0].value;
    axios
      .post("/api/setup/create", {
        gameType,
        roles: roleData.roles,
        gameSettings: gameSettings || {},
        name: setupName,
        startState: "Write",
        whispers: false,
        noReveal: true,
        leakPercentage: 100,
        editing,
        id: params.get("edit"),
      })
      .then((res) => {
        siteInfo.showAlert(
          `${editing ? "Edited" : "Created"} setup '${setupName}'`,
          "success"
        );
        setRedirect(res.data);
      })
      .catch(errorAlert);
  }

  return (
    <CreateBrowser
      gameType={gameType}
      formFields={formFields}
      updateFormFields={updateFormFields}
      resetFormFields={resetFormFields}
      closedField={{ value: false }}
      formFieldValueMods={{}}
      onCreateSetup={onCreateSetup}
    />
  );
}
